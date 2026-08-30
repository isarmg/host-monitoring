use axum::{
    Json,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Serialize;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    BadRequest(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{0}")]
    UnsupportedMediaType(String),
    #[error("{0}")]
    TooManyRequests(String),
    #[error("login rate limit exceeded")]
    LoginRateLimited { retry_after: u64 },
    #[error("{0}")]
    Unavailable(String),
    #[error("database is unavailable")]
    Database(#[source] anyhow::Error),
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    message: &'a str,
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::UnsupportedMediaType(_) => StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Self::TooManyRequests(_) | Self::LoginRateLimited { .. } => {
                StatusCode::TOO_MANY_REQUESTS
            }
            Self::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Database(_) => StatusCode::SERVICE_UNAVAILABLE,
        };
        let retry_after = match &self {
            Self::LoginRateLimited { retry_after } => Some(*retry_after),
            _ => None,
        };
        let message = self.to_string();
        let mut response = (status, Json(ErrorBody { message: &message })).into_response();
        if let Some(retry_after) = retry_after {
            response.headers_mut().insert(
                header::RETRY_AFTER,
                HeaderValue::from_str(&retry_after.to_string())
                    .expect("an integer Retry-After is a valid header value"),
            );
        }
        response
    }
}

pub fn database(error: impl Into<anyhow::Error>) -> Error {
    let error = error.into();
    tracing::warn!(%error, "host-monitoring PostgreSQL operation failed");
    Error::Database(error)
}
