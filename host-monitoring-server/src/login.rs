use std::{
    collections::HashMap,
    hash::Hash,
    net::IpAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use sha2::{Digest, Sha256};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use crate::{
    error::{Error, Result},
    store::StoredUser,
};

pub(crate) const LOGIN_BODY_LIMIT_BYTES: usize = 4 * 1024;

const SOURCE_BURST: u32 = 16;
const SOURCE_REFILL_INTERVAL: Duration = Duration::from_secs(1);
const SOURCE_ENTRY_CAPACITY: usize = 2_048;
const ACCOUNT_BURST: u32 = 8;
const ACCOUNT_REFILL_INTERVAL: Duration = Duration::from_secs(15);
const ACCOUNT_ENTRY_CAPACITY: usize = 4_096;
const RATE_ENTRY_TTL: Duration = Duration::from_secs(15 * 60);
const ARGON2_CONCURRENCY: usize = 2;
const ARGON2_ACQUIRE_TIMEOUT: Duration = Duration::from_secs(1);
// Generated with the same Argon2::default parameters used by isarmg-auth.
const DUMMY_PASSWORD_HASH: &str = "$argon2id$v=19$m=19456,t=2,p=1$aOVS660TGXMspMgoSOcv6A$1eMydp1lX0/SzNdUYR28nln2fa2gMPGF626+W6gPKK8";

#[derive(Clone)]
pub(crate) struct LoginAdmission {
    rates: Arc<Mutex<LoginRateState>>,
    argon2_slots: Arc<Semaphore>,
    argon2_acquire_timeout: Duration,
    dummy_password_hash: Arc<str>,
}

impl LoginAdmission {
    pub(crate) fn production() -> Self {
        Self::new(
            BucketPolicy::new(SOURCE_BURST, SOURCE_REFILL_INTERVAL),
            SOURCE_ENTRY_CAPACITY,
            BucketPolicy::new(ACCOUNT_BURST, ACCOUNT_REFILL_INTERVAL),
            ACCOUNT_ENTRY_CAPACITY,
            RATE_ENTRY_TTL,
            ARGON2_CONCURRENCY,
            ARGON2_ACQUIRE_TIMEOUT,
        )
    }

    fn new(
        source_policy: BucketPolicy,
        source_capacity: usize,
        account_policy: BucketPolicy,
        account_capacity: usize,
        entry_ttl: Duration,
        argon2_concurrency: usize,
        argon2_acquire_timeout: Duration,
    ) -> Self {
        assert!(argon2_concurrency > 0);
        assert!(!argon2_acquire_timeout.is_zero());
        Self {
            rates: Arc::new(Mutex::new(LoginRateState {
                sources: BoundedBuckets::new(source_policy, source_capacity, entry_ttl),
                accounts: BoundedBuckets::new(account_policy, account_capacity, entry_ttl),
            })),
            argon2_slots: Arc::new(Semaphore::new(argon2_concurrency)),
            argon2_acquire_timeout,
            dummy_password_hash: Arc::from(DUMMY_PASSWORD_HASH),
        }
    }

    #[cfg(test)]
    pub(crate) fn for_test(
        source_burst: u32,
        account_burst: u32,
        argon2_concurrency: usize,
        argon2_acquire_timeout: Duration,
    ) -> Self {
        Self::new(
            BucketPolicy::new(source_burst, Duration::from_secs(60)),
            8,
            BucketPolicy::new(account_burst, Duration::from_secs(60)),
            8,
            Duration::from_secs(300),
            argon2_concurrency,
            argon2_acquire_timeout,
        )
    }

    pub(crate) fn check_source(&self, source: IpAddr) -> Result<()> {
        self.check_source_at(canonical_ip(source), Instant::now())
    }

    fn check_source_at(&self, source: IpAddr, now: Instant) -> Result<()> {
        self.rates
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .sources
            .check_at(source, now)
            .map_err(rate_limited)
    }

    pub(crate) fn check_account(&self, normalized_account: &str) -> Result<()> {
        self.check_account_at(normalized_account, Instant::now())
    }

    fn check_account_at(&self, normalized_account: &str, now: Instant) -> Result<()> {
        self.rates
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .accounts
            .check_at(account_key(normalized_account), now)
            .map_err(rate_limited)
    }

    pub(crate) async fn verify_user(
        &self,
        user: Option<StoredUser>,
        password: String,
    ) -> Result<Option<StoredUser>> {
        let password_hash: Arc<str> = user
            .as_ref()
            .map(|user| Arc::from(user.password_hash.as_str()))
            .unwrap_or_else(|| Arc::clone(&self.dummy_password_hash));
        let verified = self
            .run_argon2(move || crate::auth::verify_password(&password, &password_hash))
            .await?;
        Ok(if verified { user } else { None })
    }

    async fn run_argon2<T, F>(&self, task: F) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let permit = match tokio::time::timeout(
            self.argon2_acquire_timeout,
            Arc::clone(&self.argon2_slots).acquire_owned(),
        )
        .await
        {
            Ok(Ok(permit)) => permit,
            Ok(Err(_)) => {
                return Err(Error::Unavailable(
                    "password verification is unavailable".into(),
                ));
            }
            Err(_) => return Err(Error::LoginRateLimited { retry_after: 1 }),
        };
        run_with_argon2_slot(permit, task).await
    }
}

async fn run_with_argon2_slot<T, F>(permit: OwnedSemaphorePermit, task: F) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tokio::task::spawn_blocking(move || {
        // Keep the permit inside the blocking closure so cancelling the async
        // request cannot hide a still-running Argon2 job from the global cap.
        let _permit = permit;
        task()
    })
    .await
    .map_err(|error| {
        tracing::error!(%error, "password verification worker failed");
        Error::Unavailable("password verification is unavailable".into())
    })
}

fn canonical_ip(address: IpAddr) -> IpAddr {
    match address {
        IpAddr::V6(address) => address
            .to_ipv4_mapped()
            .map(IpAddr::V4)
            .unwrap_or(IpAddr::V6(address)),
        IpAddr::V4(_) => address,
    }
}

fn account_key(normalized_account: &str) -> [u8; 32] {
    Sha256::digest(normalized_account.as_bytes()).into()
}

fn rate_limited(delay: Duration) -> Error {
    Error::LoginRateLimited {
        retry_after: retry_after_seconds(delay),
    }
}

fn retry_after_seconds(delay: Duration) -> u64 {
    delay
        .as_secs()
        .saturating_add(u64::from(delay.subsec_nanos() != 0))
        .max(1)
}

struct LoginRateState {
    sources: BoundedBuckets<IpAddr>,
    accounts: BoundedBuckets<[u8; 32]>,
}

#[derive(Clone, Copy)]
struct BucketPolicy {
    burst: u32,
    refill_interval: Duration,
}

impl BucketPolicy {
    fn new(burst: u32, refill_interval: Duration) -> Self {
        assert!(burst > 0);
        assert!(!refill_interval.is_zero());
        Self {
            burst,
            refill_interval,
        }
    }
}

#[derive(Clone, Copy)]
struct Bucket {
    tokens: f64,
    last_refill: Instant,
    last_seen: Instant,
}

impl Bucket {
    fn new(policy: BucketPolicy, now: Instant) -> Self {
        Self {
            tokens: f64::from(policy.burst),
            last_refill: now,
            last_seen: now,
        }
    }

    fn tokens_at(self, policy: BucketPolicy, now: Instant) -> f64 {
        let elapsed = now.saturating_duration_since(self.last_refill);
        (self.tokens + elapsed.as_secs_f64() / policy.refill_interval.as_secs_f64())
            .min(f64::from(policy.burst))
    }

    fn refill(&mut self, policy: BucketPolicy, now: Instant) {
        self.tokens = self.tokens_at(policy, now);
        self.last_refill = now;
        self.last_seen = now;
    }

    fn delay_until_tokens(self, policy: BucketPolicy, wanted: f64, now: Instant) -> Duration {
        let missing = (wanted - self.tokens_at(policy, now)).max(0.0);
        Duration::from_secs_f64(missing * policy.refill_interval.as_secs_f64())
    }
}

struct BoundedBuckets<K> {
    entries: HashMap<K, Bucket>,
    policy: BucketPolicy,
    capacity: usize,
    entry_ttl: Duration,
}

impl<K> BoundedBuckets<K>
where
    K: Clone + Eq + Hash,
{
    fn new(policy: BucketPolicy, capacity: usize, entry_ttl: Duration) -> Self {
        assert!(capacity > 0);
        assert!(!entry_ttl.is_zero());
        Self {
            entries: HashMap::new(),
            policy,
            capacity,
            entry_ttl,
        }
    }

    fn check_at(&mut self, key: K, now: Instant) -> std::result::Result<(), Duration> {
        self.prune_expired(now);
        if !self.entries.contains_key(&key) {
            self.make_room(now)?;
            self.entries
                .insert(key.clone(), Bucket::new(self.policy, now));
        }
        let entry = self.entries.get_mut(&key).expect("the bucket exists");
        entry.refill(self.policy, now);
        if entry.tokens < 1.0 {
            return Err(entry.delay_until_tokens(self.policy, 1.0, now));
        }
        entry.tokens -= 1.0;
        Ok(())
    }

    fn prune_expired(&mut self, now: Instant) {
        self.entries
            .retain(|_, entry| now.saturating_duration_since(entry.last_seen) < self.entry_ttl);
    }

    fn make_room(&mut self, now: Instant) -> std::result::Result<(), Duration> {
        if self.entries.len() < self.capacity {
            return Ok(());
        }
        let evictable = self
            .entries
            .iter()
            // Key rotation must not reset a depleted active bucket. Only an
            // already-replenished oldest entry is safe to evict.
            .filter(|(_, entry)| entry.tokens_at(self.policy, now) >= f64::from(self.policy.burst))
            .min_by_key(|(_, entry)| entry.last_seen)
            .map(|(key, _)| key.clone());
        if let Some(key) = evictable {
            self.entries.remove(&key);
            return Ok(());
        }

        let retry = self
            .entries
            .values()
            .map(|entry| {
                let until_full =
                    entry.delay_until_tokens(self.policy, f64::from(self.policy.burst), now);
                let until_expiry = self
                    .entry_ttl
                    .saturating_sub(now.saturating_duration_since(entry.last_seen));
                until_full.min(until_expiry)
            })
            .min()
            .unwrap_or(self.entry_ttl);
        Err(retry.max(Duration::from_nanos(1)))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use tokio::sync::oneshot;

    use super::*;

    #[test]
    fn source_and_normalized_account_budgets_are_independent() {
        let admission = LoginAdmission::for_test(2, 2, 1, Duration::from_millis(50));
        let now = Instant::now();
        let source: IpAddr = "192.0.2.10".parse().unwrap();
        admission.check_source_at(source, now).unwrap();
        admission.check_source_at(source, now).unwrap();
        assert!(matches!(
            admission.check_source_at(source, now),
            Err(Error::LoginRateLimited { .. })
        ));
        admission
            .check_source_at("192.0.2.11".parse().unwrap(), now)
            .unwrap();

        let first_spelling = crate::store::normalize_user_email(" Admin@Example.COM ");
        let second_spelling = crate::store::normalize_user_email("admin@example.com");
        assert_eq!(first_spelling, second_spelling);
        admission.check_account_at(&first_spelling, now).unwrap();
        admission.check_account_at(&second_spelling, now).unwrap();
        assert!(matches!(
            admission.check_account_at(&first_spelling, now),
            Err(Error::LoginRateLimited { .. })
        ));
        admission
            .check_account_at("other@example.com", now)
            .unwrap();
    }

    #[test]
    fn bounded_buckets_expire_and_only_evict_replenished_entries() {
        let policy = BucketPolicy::new(1, Duration::from_secs(1));
        let ttl = Duration::from_secs(10);
        let mut buckets = BoundedBuckets::new(policy, 2, ttl);
        let now = Instant::now();
        buckets.check_at("first", now).unwrap();
        buckets
            .check_at("second", now + Duration::from_millis(100))
            .unwrap();
        assert!(
            buckets
                .check_at("third", now + Duration::from_millis(200))
                .is_err()
        );
        assert_eq!(buckets.entries.len(), 2);

        buckets
            .check_at("third", now + Duration::from_secs(2))
            .unwrap();
        assert_eq!(buckets.entries.len(), 2);
        assert!(!buckets.entries.contains_key("first"));
        assert!(buckets.entries.contains_key("third"));

        buckets
            .check_at("after-expiry", now + ttl + Duration::from_secs(3))
            .unwrap();
        assert_eq!(buckets.entries.len(), 1);
        assert!(buckets.entries.contains_key("after-expiry"));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn argon2_semaphore_bounds_blocking_work_and_times_out_waiters() {
        let admission = LoginAdmission::for_test(8, 8, 1, Duration::from_millis(25));
        let active = Arc::new(AtomicUsize::new(0));
        let maximum = Arc::new(AtomicUsize::new(0));
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let first_admission = admission.clone();
        let first_active = Arc::clone(&active);
        let first_maximum = Arc::clone(&maximum);
        let first = tokio::spawn(async move {
            first_admission
                .run_argon2(move || {
                    let current = first_active.fetch_add(1, Ordering::SeqCst) + 1;
                    first_maximum.fetch_max(current, Ordering::SeqCst);
                    let _ = started_tx.send(());
                    let _ = release_rx.blocking_recv();
                    first_active.fetch_sub(1, Ordering::SeqCst);
                })
                .await
        });
        started_rx.await.unwrap();

        let rejected = admission.run_argon2(|| ()).await;
        release_tx.send(()).unwrap();
        first.await.unwrap().unwrap();
        assert!(matches!(
            rejected,
            Err(Error::LoginRateLimited { retry_after: 1 })
        ));
        assert_eq!(maximum.load(Ordering::SeqCst), 1);

        admission.run_argon2(|| ()).await.unwrap();
    }

    #[tokio::test]
    async fn unknown_and_wrong_passwords_both_complete_a_verification_path() {
        let admission = LoginAdmission::for_test(8, 8, 2, Duration::from_secs(1));
        let user = StoredUser {
            user_id: "user-id".into(),
            email: "admin@example.com".into(),
            password_hash: crate::auth::hash_password("correct-password").unwrap(),
            active: true,
            session_version: 1,
        };
        assert!(
            admission
                .verify_user(Some(user), "wrong-password".into())
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            admission
                .verify_user(None, "wrong-password".into())
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            admission
                .verify_user(None, "dummy-password-verification-only".into())
                .await
                .unwrap()
                .is_none(),
            "a matching dummy password must never authenticate an absent user"
        );
    }

    #[test]
    fn ipv4_mapped_sources_share_the_ipv4_budget() {
        let mapped = IpAddr::V6(std::net::Ipv4Addr::new(192, 0, 2, 1).to_ipv6_mapped());
        assert_eq!(canonical_ip(mapped), "192.0.2.1".parse::<IpAddr>().unwrap());
    }

    #[test]
    fn retry_after_is_positive_and_rounds_up_fractional_seconds() {
        assert_eq!(retry_after_seconds(Duration::ZERO), 1);
        assert_eq!(retry_after_seconds(Duration::from_nanos(1)), 1);
        assert_eq!(retry_after_seconds(Duration::from_secs(1)), 1);
        assert_eq!(
            retry_after_seconds(Duration::from_secs(1) + Duration::from_nanos(1)),
            2
        );
    }
}
