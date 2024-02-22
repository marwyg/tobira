use std::time::{Duration, Instant};

use base64::Engine;
use chrono::{DateTime, Utc, TimeZone};
use hyper::{
    Body, Request, Response, StatusCode,
    client::{Client, HttpConnector},
    http::{uri::{Authority, Scheme, Uri}, request, self},
};
use hyper_rustls::HttpsConnector;
use secrecy::{ExposeSecret, Secret};
use tap::TapFallible;

use crate::{
    config::Config,
    prelude::*,
    sync::harvest::HarvestResponse,
    util::download_body,
};

use super::VersionResponse;


/// Used to send request to the harvesting API.
pub(crate) struct OcClient {
    http_client: Client<HttpsConnector<HttpConnector>, Body>,
    scheme: Scheme,
    authority: Authority,
    auth_header: Secret<String>,
    username: String,
}

impl OcClient {
    const HARVEST_PATH: &'static str = "/tobira/harvest";
    const VERSION_PATH: &'static str = "/tobira/version";
    const STATS_PATH: &'static str = "/tobira/stats";

    pub(crate) fn new(config: &Config) -> Self {
        let http_client = crate::util::http_client();

        // Prepare authentication
        let credentials = format!(
            "{}:{}",
            config.sync.user,
            config.sync.password.expose_secret(),
        );
        let encoded_credentials = base64::engine::general_purpose::STANDARD.encode(credentials);
        let auth_header = format!("Basic {}", encoded_credentials);

        Self {
            http_client,
            scheme: config.opencast.sync_node().scheme.clone(),
            authority: config.opencast.sync_node().authority.clone(),
            auth_header: Secret::new(auth_header),
            username: config.sync.user.clone(),
        }
    }

    pub(crate) async fn get_version(&self) -> Result<VersionResponse> {
        trace!("Sending request to '{}'", Self::VERSION_PATH);
        let (uri, req) = self.build_req(Self::VERSION_PATH);

        let response = self.http_client.request(req)
            .await
            .with_context(|| format!("HTTP request failed (to '{uri}')"))?;

        let (out, _) = self.deserialize_response(response, &uri).await?;
        Ok(out)
    }

    pub(crate) async fn test_harvest(&self) -> Result<()> {
        // `timestamp_opt(0, 0)` should only ever be `Single(...)`, so `unwrap` is fine
        self.send_harvest(Utc.timestamp_opt(0, 0).unwrap(), 2).await
            .map(|_| ())
            .context("test harvest request failed")
    }

    /// Sends a request to the harvesting API, checks and deserializes the
    /// response.
    pub(super) async fn send_harvest(
        &self,
        since: DateTime<Utc>,
        preferred_amount: u64,
    ) -> Result<HarvestResponse> {
        let before = Instant::now();

        let pq = format!(
            "{}?since={}&preferredAmount={}",
            Self::HARVEST_PATH,
            since.timestamp_millis(),
            preferred_amount,
        );
        let (uri, req) = self.build_req(&pq);

        trace!("Sending harvest request (since = {:?}): GET {}", since, uri);

        let response = tokio::time::timeout(Duration::from_secs(60), self.http_client.request(req))
            .await
            .with_context(|| format!("Harvest request timed out (to '{uri}')"))?
            .with_context(|| format!("Harvest request failed (to '{uri}')"))?;

        let (out, body_len) = self.deserialize_response::<HarvestResponse>(response, &uri).await?;
        log!(
            if out.items.len() > 0 { log::Level::Debug } else { log::Level::Trace },
            "Received {} KiB ({} items) from the harvest API (in {:.2?}, since = {:?})",
            body_len / 1024,
            out.items.len(),
            before.elapsed(),
            since,
        );

        Ok(out)
    }

    /// Sends the given serialized JSON to the `/stats` endpoint in Opencast.
    pub async fn send_stats(&self, stats: String) -> Result<Response<Body>> {
        let req = self.req_builder(Self::STATS_PATH)
            .method(http::Method::POST)
            .header(http::header::CONTENT_TYPE, "application/json")
            .body(stats.into())
            .expect("failed to build request");

        self.http_client.request(req).await.map_err(Into::into)
    }

    fn build_req(&self, path_and_query: &str) -> (Uri, Request<Body>) {
        let req = self.req_builder(path_and_query)
            .body(Body::empty())
            .expect("bug: failed to build request");

        (req.uri().clone(), req)
    }

    fn req_builder(&self, path_and_query: &str) -> request::Builder {
        let uri = Uri::builder()
            .scheme(self.scheme.clone())
            .authority(self.authority.clone())
            .path_and_query(path_and_query)
            .build()
            .expect("bug: failed build URI");

        Request::builder()
            .uri(&uri)
            .header("Authorization", self.auth_header.expose_secret())
    }

    async fn deserialize_response<T: for<'de> serde::Deserialize<'de>>(
        &self,
        response: Response<Body>,
        uri: &Uri,
    ) -> Result<(T, usize)> {
        let (parts, body) = response.into_parts();
        let body = download_body(body).await
            .with_context(|| format!("failed to download body from '{uri}'"))?;

        if parts.status != StatusCode::OK {
            trace!("HTTP response: {:#?}", parts);
            if parts.status == StatusCode::UNAUTHORIZED {
                bail!(
                    "Requesting '{}' with login '{}:******' returned {}. \
                        Check 'sync.user' and 'sync.password'!",
                    uri, self.username, parts.status,
                );
            } else {
                bail!(
                    "API returned unexpected HTTP code {} (for '{}', authenticating as '{}')",
                    parts.status, uri, self.username,
                );
            }
        }

        let out = serde_json::from_slice::<T>(&body)
            .with_context(|| format!("Failed to deserialize API response from {uri}"))
            .tap_err(|_| trace!("HTTP response: {:#?}", parts))?;

        Ok((out, body.len()))
    }
}
