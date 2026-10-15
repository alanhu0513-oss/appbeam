"use client";

import { useState } from "react";

export default function PhoneFrame({
  url,
  loading,
  liveLabel,
}: {
  url: string | null;
  loading: boolean;
  liveLabel: string;
}) {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="flex flex-col items-center gap-5">
      {/* device */}
      <div className="relative">
        <div className="absolute -left-1 top-28 h-14 w-[3px] rounded-full bg-white/20" />
        <div className="absolute -left-1 top-48 h-9 w-[3px] rounded-full bg-white/20" />
        <div className="absolute -right-1 top-36 h-16 w-[3px] rounded-full bg-white/20" />

        <div className="relative w-[330px] rounded-[3rem] border border-white/15 bg-gradient-to-b from-[#1b1e2a] to-[#0a0b10] p-3 shadow-phone">
          <div className="relative overflow-hidden rounded-[2.4rem] bg-black">
            {/* dynamic island */}
            <div className="absolute left-1/2 top-2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />

            {/* status bar */}
            <div className="relative z-10 flex items-center justify-between px-6 pb-1 pt-3 font-mono text-[10px] text-white/70">
              <span>9:41</span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
                {url ? "live" : "idle"}
              </span>
            </div>

            {/* viewport */}
            <div className="relative h-[560px] w-full bg-[#0b0d14]">
              {url ? (
                <iframe
                  key={reloadKey}
                  src={url}
                  title="Appbeam simulator output"
                  className="h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  allow="camera; microphone; clipboard-write; geolocation"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                  <div className="relative h-16 w-16">
                    <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent-violet" />
                    <div className="absolute inset-2 rounded-full border border-white/10" />
                  </div>
                  <p className="font-mono text-[11px] leading-relaxed text-slate-500">
                    {loading ? (
                      <>
                        pipeline running…
                        <br />
                        waiting for a live Vercel URL
                      </>
                    ) : (
                      <>
                        drop a binary
                        <br />
                        the deployed app appears here
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* home indicator */}
            <div className="flex justify-center pb-2 pt-2">
              <div className="h-1 w-28 rounded-full bg-white/30" />
            </div>
          </div>
        </div>
      </div>

      {/* url bar */}
      <div className="flex w-full max-w-[380px] items-center gap-2">
        <div className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
          <p className="truncate font-mono text-[11px] text-slate-400">
            {url ?? "https://*.vercel.app"}
          </p>
        </div>
        <button
          type="button"
          className="ghost-btn"
          disabled={!url}
          onClick={() => setReloadKey((k) => k + 1)}
          title="Reload the deployed app"
        >
          ⟳ reload
        </button>
        {url ? (
          <a
            className="ghost-btn"
            href={url}
            target="_blank"
            rel="noreferrer"
            title="Open the live deployment in a new tab"
          >
            ↗ open
          </a>
        ) : null}
      </div>

      <p className="label text-center">{liveLabel}</p>
    </div>
  );
}
