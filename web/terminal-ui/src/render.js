const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const shortHash = (hash) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

const renderOrderbookSide = (orders, emptyLabel) => {
  if (orders.length === 0) {
    return `<li class="muted">${escapeHtml(emptyLabel)}</li>`;
  }

  return orders.map((order) => `
    <li>
      <span>${escapeHtml(order.price)}</span>
      <span>${escapeHtml(order.remainingAmount)}</span>
      <code>${escapeHtml(shortHash(order.orderHash))}</code>
    </li>
  `).join('');
};

export const renderTradeProofPanel = (fixture) => {
  const { market, orderbook, fill, trade, proof, custody } = fixture;
  const proofJson = JSON.stringify(proof, null, 2);

  return `
    <section class="terminal-shell" aria-label="Quai Terminal DEX mock vertical slice">
      <header class="topbar">
        <div>
          <p class="eyebrow">QDEX / terminal-native MVP</p>
          <h1>${escapeHtml(market.id)}</h1>
        </div>
        <div class="status-stack">
          <span class="badge green">API-first</span>
          <span class="badge yellow">settlementMode: ${escapeHtml(market.settlementMode)}</span>
          <span class="badge">${escapeHtml(market.custodyModel)}</span>
        </div>
      </header>

      <section class="grid">
        <article class="panel market-panel">
          <h2>market</h2>
          <dl class="kv">
            <div><dt>pair</dt><dd>${escapeHtml(market.base)} / ${escapeHtml(market.quote)}</dd></div>
            <div><dt>book sequence</dt><dd>${escapeHtml(orderbook.sequence)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(custody.note)}</dd></div>
            <div><dt>withdrawals</dt><dd>${escapeHtml(custody.withdrawalAuthority)}</dd></div>
          </dl>
        </article>

        <article class="panel book-panel">
          <h2>orderbook after match</h2>
          <div class="book-columns">
            <div>
              <h3>bids</h3>
              <ul>${renderOrderbookSide(orderbook.bids, 'empty — crossed taker consumed resting ask')}</ul>
            </div>
            <div>
              <h3>asks</h3>
              <ul>${renderOrderbookSide(orderbook.asks, 'empty — confirmed mock fill cleared the book')}</ul>
            </div>
          </div>
        </article>

        <article class="panel trade-panel">
          <h2>last trade</h2>
          <dl class="kv large">
            <div><dt>trade</dt><dd><code>${escapeHtml(trade.tradeId)}</code></dd></div>
            <div><dt>fill</dt><dd><code>${escapeHtml(trade.fillId)}</code></dd></div>
            <div><dt>market</dt><dd>${escapeHtml(trade.marketId)}</dd></div>
            <div><dt>price</dt><dd>price ${escapeHtml(trade.price)}</dd></div>
            <div><dt>amount</dt><dd>amount ${escapeHtml(trade.amount)}</dd></div>
            <div><dt>status</dt><dd><span class="green">mock settlement confirmed</span></dd></div>
            <div><dt>proof</dt><dd><a href="${escapeHtml(trade.proofUrl)}">${escapeHtml(trade.proofUrl)}</a></dd></div>
          </dl>
        </article>

        <article class="panel proof-panel">
          <h2>proof projection</h2>
          <p class="warning">Mock proof only: no real Quai transaction, no explorer URL, no funds moved.</p>
          <dl class="kv">
            <div><dt>settlement tx</dt><dd><code>${escapeHtml(proof.settlementTx)}</code></dd></div>
            <div><dt>block</dt><dd>${escapeHtml(proof.blockNumber)}</dd></div>
            <div><dt>event index</dt><dd>${escapeHtml(proof.eventIndex)}</dd></div>
            <div><dt>settlementMode</dt><dd>${escapeHtml(proof.rawEvent.settlementMode)}</dd></div>
            <div><dt>maker order</dt><dd><code>${escapeHtml(shortHash(fill.makerOrderHash))}</code></dd></div>
            <div><dt>taker order</dt><dd><code>${escapeHtml(shortHash(fill.takerOrderHash))}</code></dd></div>
          </dl>
          <details>
            <summary>raw proof event</summary>
            <pre>${escapeHtml(proofJson)}</pre>
          </details>
        </article>

        <article class="panel command-panel">
          <h2>keyboard</h2>
          <p><kbd>/</kbd> search market · <kbd>b</kbd> buy · <kbd>s</kbd> sell · <kbd>o</kbd> open orders · <kbd>?</kbd> help</p>
          <pre>:buy QI-QUAI 100 @ 5
:proof trade-000001
:cancel all</pre>
        </article>

        <article class="panel log-panel">
          <h2>execution log</h2>
          <pre>&gt; wallet connected in mock/dev mode
&gt; resting sell accepted: ${escapeHtml(shortHash(fill.makerOrderHash))}
&gt; order signed locally
&gt; crossing buy accepted: ${escapeHtml(shortHash(fill.takerOrderHash))}
&gt; fill packet created: ${escapeHtml(fill.fillId)}
&gt; mock settlement confirmed: ${escapeHtml(proof.settlementTx)}
&gt; proof projected: ${escapeHtml(trade.proofUrl)}</pre>
        </article>
      </section>
    </section>
  `;
};
