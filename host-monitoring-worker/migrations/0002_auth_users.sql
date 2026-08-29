CREATE TABLE host_monitoring.auth_users (
    user_id       uuid PRIMARY KEY,
    email         text NOT NULL UNIQUE
                       CHECK (email = lower(trim(email)) AND length(trim(email)) BETWEEN 3 AND 255),
    password_hash text NOT NULL CHECK (length(password_hash) > 0),
    active        boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);
