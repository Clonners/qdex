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

const renderLiveStreamPanel = (liveStream) => {
  if (liveStream === undefined || liveStream === null) {
    return '';
  }

  const permissions = (liveStream.permissions ?? []).join(', ');
  const streamReason = liveStream.streamEvent?.reason ?? 'initial_snapshot';
  const streamMarket = liveStream.streamEvent?.marketId ?? 'all-markets';

  return `
        <article class="panel stream-panel">
          <h2>live fills stream</h2>
          <p class="warning">${escapeHtml(liveStream.safetyNotice)}</p>
          <dl class="kv">
            <div><dt>channel</dt><dd>${escapeHtml(liveStream.channel)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(liveStream.source)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(liveStream.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>last event</dt><dd>${escapeHtml(streamReason)}</dd></div>
            <div><dt>market</dt><dd>${escapeHtml(streamMarket)}</dd></div>
          </dl>
        </article>
  `;
};

const renderOrderRows = (orders = []) => {
  if (orders.length === 0) {
    return '<li class="muted">no private order updates yet</li>';
  }

  return orders.map((order) => `
    <li>
      <span>${escapeHtml(order.status)}</span>
      <span>${escapeHtml(order.remainingAmount)}</span>
      <code>${escapeHtml(shortHash(order.orderHash))}</code>
    </li>
  `).join('');
};

const renderOrderStreamPanel = (orderStream, orders = []) => {
  if (orderStream === undefined || orderStream === null) {
    return '';
  }

  const permissions = (orderStream.permissions ?? []).join(', ');
  const cancellationPermissions = (orderStream.cancellationPermissions ?? []).join(', ') || 'none';
  const streamReason = orderStream.streamEvent?.reason ?? 'initial_snapshot';
  const streamMarket = orderStream.streamEvent?.marketId ?? 'all-markets';
  const cancelledHashes = (orderStream.cancelledOrderHashes ?? [])
    .map((hash) => shortHash(hash))
    .join(', ') || 'none';
  const nonceManager = orderStream.nonceManager ?? 'none';
  const nonceCancellation = orders
    .map((order) => order.nonceCancellation)
    .filter((value) => value !== undefined && value !== null)
    .join(', ') || 'none';

  return `
        <article class="panel stream-panel">
          <h2>live orders stream</h2>
          <p class="warning">${escapeHtml(orderStream.safetyNotice)}</p>
          <dl class="kv">
            <div><dt>channel</dt><dd>${escapeHtml(orderStream.channel)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(orderStream.source)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(orderStream.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>cancel perms</dt><dd>${escapeHtml(cancellationPermissions)}</dd></div>
            <div><dt>last event</dt><dd>${escapeHtml(streamReason)}</dd></div>
            <div><dt>market</dt><dd>${escapeHtml(streamMarket)}</dd></div>
            <div><dt>nonce manager</dt><dd>${escapeHtml(nonceManager)}</dd></div>
            <div><dt>cancelled</dt><dd>${escapeHtml(cancelledHashes)}</dd></div>
            <div><dt>nonce status</dt><dd>${escapeHtml(nonceCancellation)}</dd></div>
          </dl>
          ${orderStream.message === null || orderStream.message === undefined ? '' : `<p class="warning">${escapeHtml(orderStream.message)}</p>`}
          <h3>private order projection</h3>
          <ul>${renderOrderRows(orders)}</ul>
        </article>
  `;
};

export const renderTradeProofPanel = (fixture) => {
  const { sources, market, orderbook, fill, trade, proof, custody } = fixture;
  const proofJson = JSON.stringify(proof, null, 2);
  const proofSettlementTx = proof.settlementTx ?? 'null (mock)';
  const proofBlockNumber = proof.blockNumber ?? 'null (mock)';
  const proofSettlementMode = proof.settlementMode ?? proof.rawEvent.settlementMode;
  const fillSource = sources?.fills ?? 'unknown-fill-source';
  const proofSource = sources?.proof ?? 'unknown-proof-source';

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
            <div><dt>fill source</dt><dd>${escapeHtml(fillSource)}</dd></div>
            <div><dt>projection type</dt><dd><code>${escapeHtml(fill.projectionType)}</code></dd></div>
            <div><dt>source event</dt><dd><code>${escapeHtml(fill.sourceEventId)}</code></dd></div>
            <div><dt>proof</dt><dd><a href="${escapeHtml(trade.proofUrl)}">${escapeHtml(trade.proofUrl)}</a></dd></div>
          </dl>
        </article>

        <article class="panel proof-panel">
          <h2>proof projection</h2>
          <p class="warning">Mock proof only: no real Quai transaction, no explorer URL, no funds moved.</p>
          <dl class="kv">
            <div><dt>settlement tx</dt><dd><code>${escapeHtml(proofSettlementTx)}</code></dd></div>
            <div><dt>mock reference</dt><dd><code>${escapeHtml(proof.mockSettlementReference)}</code></dd></div>
            <div><dt>block</dt><dd>${escapeHtml(proofBlockNumber)}</dd></div>
            <div><dt>event index</dt><dd>${escapeHtml(proof.eventIndex)}</dd></div>
            <div><dt>proof source</dt><dd>${escapeHtml(proofSource)}</dd></div>
            <div><dt>created from</dt><dd><code>${escapeHtml(proof.createdFromEventId)}</code></dd></div>
            <div><dt>settlementMode</dt><dd>${escapeHtml(proofSettlementMode)}</dd></div>
            <div><dt>maker order</dt><dd><code>${escapeHtml(shortHash(fill.makerOrderHash))}</code></dd></div>
            <div><dt>taker order</dt><dd><code>${escapeHtml(shortHash(fill.takerOrderHash))}</code></dd></div>
          </dl>
          <details>
            <summary>raw proof event</summary>
            <pre>${escapeHtml(proofJson)}</pre>
          </details>
        </article>

${renderLiveStreamPanel(fixture.liveStream)}

${renderOrderStreamPanel(fixture.orderStream, fixture.orders)}

        <article class="panel command-panel">
          <h2>keyboard</h2>
          <p><kbd>/</kbd> search market · <kbd>b</kbd> buy · <kbd>s</kbd> sell · <kbd>o</kbd> open orders · <kbd>?</kbd> help</p>
          <pre>:sell QI-QUAI 100 @ 5
:buy QI-QUAI 100 market_ioc slippage=50bps
:proof trade-000001
:cancel all</pre>
          <div class="mock-trigger">
            <button type="button" data-qdx-trigger-cross>submit mock cross</button>
            <p class="muted" data-qdx-trigger-status>Posts a local/dev GTC sell plus IOC buy with signed slippage bounds; no real Quai tx/explorer/funds.</p>
            <button type="button" data-qdx-trigger-cancel>create + cancel mock order</button>
            <p class="muted" data-qdx-cancel-status>Posts one local/dev resting order, then matcher-local cancellation does not cancel on-chain nonce; no real Quai tx/explorer/funds.</p>
          </div>
        </article>

        <article class="panel log-panel">
          <h2>execution log</h2>
          <pre>&gt; wallet connected in mock/dev mode
&gt; resting sell accepted: ${escapeHtml(shortHash(fill.makerOrderHash))}
&gt; order signed locally
&gt; crossing buy accepted: ${escapeHtml(shortHash(fill.takerOrderHash))}
&gt; fill packet created: ${escapeHtml(fill.fillId)}
&gt; mock settlement reference: ${escapeHtml(proof.mockSettlementReference)}
&gt; proof projected: ${escapeHtml(trade.proofUrl)}</pre>
        </article>
      </section>
    </section>
  `;
};
