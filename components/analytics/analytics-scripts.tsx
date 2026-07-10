import Script from "next/script";
import { getGtmId, getMetaPixelId } from "@/lib/analytics/tracking";

/**
 * Root-layout analytics scripts.
 *
 * Renders GTM base + Meta Pixel base only when the corresponding
 * NEXT_PUBLIC_ env var is set. Missing IDs = the component renders
 * nothing for that platform. No console noise in that case — the
 * intent is that dev / preview / prod can each opt in independently.
 *
 * Both scripts use `strategy="afterInteractive"` so they never block
 * hydration. Meta Pixel additionally initialises `fbq` inline so
 * client-side `trackMetaEvent()` calls made before the network
 * script finishes downloading are queued rather than dropped.
 *
 * We include a `<noscript>` iframe fallback for GTM and a `<noscript>`
 * `<img>` for Meta Pixel so ads still track when JS is disabled.
 * Neither runs unless the platform is configured.
 *
 * Security note: only these public NEXT_PUBLIC_ IDs appear in the
 * markup. No server keys or secrets are exposed by this file.
 */

export function AnalyticsScripts() {
  const gtmId = getGtmId();
  const metaPixelId = getMetaPixelId();

  if (!gtmId && !metaPixelId) return null;

  return (
    <>
      {gtmId && (
        <>
          <Script id="bpm-gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
      )}

      {metaPixelId && (
        <>
          <Script id="bpm-meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}
    </>
  );
}
