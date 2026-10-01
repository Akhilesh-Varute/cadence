"use client";

import { useStore } from "../lib/store";

// What a tab shows before the first data arrives: its title, and if the
// server can't be reached and nothing is cached yet, how to retry.
export default function Pending({ title }) {
  const { error, retry } = useStore();
  return (
    <>
      <header className="head">
        <h1 className="big">{title}</h1>
      </header>
      {error && (
        <div className="empty">
          <b>Can&apos;t load your data.</b>
          {error}
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={retry}>Try again</button>
          </div>
        </div>
      )}
    </>
  );
}
