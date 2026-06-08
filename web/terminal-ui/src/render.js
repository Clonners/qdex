import { normalizeVaultHistoryPanelFixture } from './vault-history-panel.js';

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

const renderBalanceRows = (balances = []) => {
  if (balances.length === 0) {
    return '<li class="muted">no mock vault balances yet</li>';
  }

  return balances.map((balance) => `
    <li>
      <span>${escapeHtml(balance.token ?? balance.symbol ?? 'token')}</span>
      <span>${escapeHtml(balance.available ?? '0')}</span>
      <span>${escapeHtml(balance.locked ?? balance.total ?? '0')}</span>
    </li>
  `).join('');
};

const renderBalanceStreamPanel = (balanceStream, balanceProjection, balances = []) => {
  if (balanceStream === undefined || balanceStream === null) {
    return '';
  }

  const projection = balanceProjection ?? {};
  const permissions = (balanceStream.permissions ?? projection.permissions ?? []).join(', ');
  const streamReason = balanceStream.streamEvent?.reason ?? 'initial_snapshot';
  const projectionSafetyNotice = balanceStream.projectionSafetyNotice ?? projection.safetyNotice ?? '';
  const withdrawalAuthority = balanceStream.withdrawalAuthority ?? projection.withdrawalAuthority ?? 'owner-wallet-only';
  const settlementMode = balanceStream.settlementMode ?? projection.settlementMode ?? 'mock';
  const realQuaiTransactions = balanceStream.realQuaiTransactions ?? projection.realQuaiTransactions ?? false;
  const walletRequired = balanceStream.walletRequired ?? projection.walletRequired ?? false;
  const projectionCustody = projection.custody ?? 'non-custodial-contract-vault';

  return `
        <article class="panel stream-panel balance-panel">
          <h2>live balances stream</h2>
          <p class="warning">${escapeHtml(balanceStream.safetyNotice)}</p>
          <p class="warning">${escapeHtml(projectionSafetyNotice)}</p>
          <dl class="kv">
            <div><dt>channel</dt><dd>${escapeHtml(balanceStream.channel)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(balanceStream.source)}</dd></div>
            <div><dt>stream custody</dt><dd>${escapeHtml(balanceStream.custody)}</dd></div>
            <div><dt>vault custody</dt><dd>${escapeHtml(projectionCustody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>withdrawals</dt><dd>${escapeHtml(withdrawalAuthority)}</dd></div>
            <div><dt>settlementMode</dt><dd>${escapeHtml(settlementMode)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(walletRequired)}</dd></div>
            <div><dt>last event</dt><dd>${escapeHtml(streamReason)}</dd></div>
          </dl>
          <h3>private vault balance projection</h3>
          <ul>${renderBalanceRows(balances)}</ul>
        </article>
  `;
};

const renderVaultHistoryStreamEvents = (events = []) => {
  if (events.length === 0) {
    return '<li class="muted">waiting for private vault history stream snapshot</li>';
  }

  return events.map(({ channel, event }) => `
    <li><span>${escapeHtml(channel)}</span> <code>${escapeHtml(event?.reason ?? 'initial_snapshot')}</code></li>
  `).join('');
};

const renderVaultHistoryStreamPanel = (vaultHistoryStream) => {
  if (vaultHistoryStream === undefined || vaultHistoryStream === null) {
    return '';
  }

  const permissions = (vaultHistoryStream.permissions ?? []).join(', ');
  const channels = (vaultHistoryStream.channels ?? []).join(', ');
  const projectionSafetyNotices = vaultHistoryStream.projectionSafetyNotices ?? {};

  return `
        <article class="panel stream-panel vault-history-stream-panel">
          <h2>live vault history streams</h2>
          <p class="warning">${escapeHtml(vaultHistoryStream.safetyNotice)}</p>
          <p class="warning">${escapeHtml(projectionSafetyNotices.deposits ?? '')}</p>
          <p class="warning">${escapeHtml(projectionSafetyNotices.withdrawals ?? '')}</p>
          <dl class="kv">
            <div><dt>channels</dt><dd>${escapeHtml(channels)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(vaultHistoryStream.source)}</dd></div>
            <div><dt>stream custody</dt><dd>${escapeHtml(vaultHistoryStream.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>settlementMode</dt><dd>${escapeHtml(vaultHistoryStream.settlementMode)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(vaultHistoryStream.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(vaultHistoryStream.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(vaultHistoryStream.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(vaultHistoryStream.tradingVaultMutation)}</dd></div>
            <div><dt>row count</dt><dd>${escapeHtml(vaultHistoryStream.rowCount ?? 0)}</dd></div>
          </dl>
          <h3>private stream events</h3>
          <ul>${renderVaultHistoryStreamEvents(vaultHistoryStream.streamEvents)}</ul>
        </article>
  `;
};

const renderVaultOperationPanel = (vaultOperation) => {
  if (vaultOperation === undefined || vaultOperation === null) {
    return '';
  }

  const permissions = (vaultOperation.permissions ?? []).join(', ');
  const safetyNotice = vaultOperation.safety?.notice ?? '';

  return `
        <article class="panel stream-panel vault-operation-panel">
          <h2>prepare-only vault operation</h2>
          <p class="warning">${escapeHtml(safetyNotice)}</p>
          <p class="warning">${escapeHtml(vaultOperation.message)}</p>
          <dl class="kv">
            <div><dt>http status</dt><dd>${escapeHtml(vaultOperation.httpStatus)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(vaultOperation.source)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(vaultOperation.custody)}</dd></div>
            <div><dt>vault operation</dt><dd>${escapeHtml(vaultOperation.vaultOperation)}</dd></div>
            <div><dt>operation status</dt><dd>${escapeHtml(vaultOperation.operationStatus)}</dd></div>
            <div><dt>owner auth</dt><dd>${escapeHtml(vaultOperation.ownerAuthorization)}</dd></div>
            <div><dt>delegate authority</dt><dd>${escapeHtml(vaultOperation.delegateAuthority)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(vaultOperation.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(vaultOperation.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(vaultOperation.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(vaultOperation.tradingVaultMutation)}</dd></div>
            <div><dt>approval gate</dt><dd>${escapeHtml(vaultOperation.approvalGate)}</dd></div>
          </dl>
        </article>
  `;
};

const renderDelegateKeyOperationPanel = (delegateKeyOperation) => {
  if (delegateKeyOperation === undefined || delegateKeyOperation === null) {
    return '';
  }

  const permissions = (delegateKeyOperation.permissions ?? []).join(', ');
  const requiredFields = (delegateKeyOperation.requiredFields ?? []).join(', ');
  const keyId = delegateKeyOperation.keyId ?? 'local-prepare-only-not-registered';

  return `
        <article class="panel stream-panel delegate-key-operation-panel">
          <h2>prepare-only delegate/API key</h2>
          <p class="warning">Owner-signed DelegateKeyRegistry boundary: no wallet is loaded, no signature is created, no RPC URL is read, no transaction is submitted, and no funds move.</p>
          <p class="warning">${escapeHtml(delegateKeyOperation.message)}</p>
          <dl class="kv">
            <div><dt>http status</dt><dd>${escapeHtml(delegateKeyOperation.httpStatus)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(delegateKeyOperation.source)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(delegateKeyOperation.custody)}</dd></div>
            <div><dt>operation</dt><dd>${escapeHtml(delegateKeyOperation.operation)}</dd></div>
            <div><dt>key id</dt><dd>${escapeHtml(keyId)}</dd></div>
            <div><dt>operation status</dt><dd>${escapeHtml(delegateKeyOperation.operationStatus)}</dd></div>
            <div><dt>owner auth</dt><dd>${escapeHtml(delegateKeyOperation.ownerAuthorization)}</dd></div>
            <div><dt>delegate authority</dt><dd>${escapeHtml(delegateKeyOperation.delegateAuthority)}</dd></div>
            <div><dt>required fields</dt><dd>${escapeHtml(requiredFields)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>delegate can withdraw</dt><dd>${escapeHtml(delegateKeyOperation.delegateCanWithdraw)}</dd></div>
            <div><dt>delegate can admin</dt><dd>${escapeHtml(delegateKeyOperation.delegateCanAdmin)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(delegateKeyOperation.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(delegateKeyOperation.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(delegateKeyOperation.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(delegateKeyOperation.tradingVaultMutation)}</dd></div>
            <div><dt>approval gate</dt><dd>${escapeHtml(delegateKeyOperation.approvalGate)}</dd></div>
          </dl>
        </article>
  `;
};

const mockEvidenceLabel = (value) => value ?? 'null (mock)';

const renderVaultHistoryRows = (rows = [], emptyLabel) => {
  if (rows.length === 0) {
    return `<li class="muted">${escapeHtml(emptyLabel)}</li>`;
  }

  return rows.map((row) => `
    <li>
      <span>${escapeHtml(row.eventName ?? row.projectionType ?? 'TradingVault event')}</span>
      <span>${escapeHtml(row.token ?? 'token')}</span>
      <span>${escapeHtml(row.amount ?? '0')}</span>
      <code>${escapeHtml(row.sourceEventId ?? 'mock-event-pending')}</code>
    </li>
  `).join('');
};

const renderVaultHistorySection = ({ title, envelope, rows, emptyLabel }) => {
  const permissions = (envelope.permissions ?? []).join(', ');

  return `
          <section class="vault-history-section">
            <h3>${escapeHtml(title)}</h3>
            <p class="warning">${escapeHtml(envelope.safetyNotice)}</p>
            <dl class="kv">
              <div><dt>source</dt><dd>${escapeHtml(envelope.source)}</dd></div>
              <div><dt>projection</dt><dd>${escapeHtml(envelope.projectionType)}</dd></div>
              <div><dt>event</dt><dd>${escapeHtml(envelope.eventName)}</dd></div>
              <div><dt>custody</dt><dd>${escapeHtml(envelope.custody)}</dd></div>
              <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
              <div><dt>settlementMode</dt><dd>${escapeHtml(envelope.settlementMode)}</dd></div>
              <div><dt>settlement tx</dt><dd><code>${escapeHtml(mockEvidenceLabel(envelope.settlementTx))}</code></dd></div>
              <div><dt>block</dt><dd>${escapeHtml(mockEvidenceLabel(envelope.blockNumber))}</dd></div>
              <div><dt>event index</dt><dd>${escapeHtml(mockEvidenceLabel(envelope.eventIndex))}</dd></div>
              <div><dt>explorer</dt><dd>${escapeHtml(mockEvidenceLabel(envelope.explorerUrl))}</dd></div>
              <div><dt>real Quai tx</dt><dd>${escapeHtml(envelope.realQuaiTransactions)}</dd></div>
              <div><dt>wallet required</dt><dd>${escapeHtml(envelope.walletRequired)}</dd></div>
              <div><dt>funds moved</dt><dd>${escapeHtml(envelope.fundsMoved)}</dd></div>
              <div><dt>TradingVault mutation</dt><dd>${escapeHtml(envelope.tradingVaultMutation)}</dd></div>
            </dl>
            <ul>${renderVaultHistoryRows(rows, emptyLabel)}</ul>
          </section>
  `;
};

const renderVaultHistoryPanel = (vaultHistory) => {
  if (vaultHistory === undefined || vaultHistory === null) {
    return '';
  }

  const history = normalizeVaultHistoryPanelFixture(vaultHistory);

  return `
        <article class="panel stream-panel vault-history-panel">
          <h2>read-only vault history</h2>
${renderVaultHistorySection({
    title: 'TradingVault Deposit history',
    envelope: history.deposits,
    rows: history.deposits.deposits,
    emptyLabel: 'no vault deposit history rows yet',
  })}
${renderVaultHistorySection({
    title: 'TradingVault Withdraw history',
    envelope: history.withdrawals,
    rows: history.withdrawals.withdrawals,
    emptyLabel: 'no vault withdrawal history rows yet',
  })}
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

${renderBalanceStreamPanel(fixture.balanceStream, fixture.balanceProjection, fixture.balances)}

${renderVaultOperationPanel(fixture.vaultOperation)}

${renderDelegateKeyOperationPanel(fixture.delegateKeyOperation)}

${renderVaultHistoryStreamPanel(fixture.vaultHistoryStream)}

${renderVaultHistoryPanel(fixture.vaultHistory)}

        <article class="panel command-panel">
          <h2>keyboard</h2>
          <p><kbd>/</kbd> search market · <kbd>b</kbd> buy · <kbd>s</kbd> sell · <kbd>o</kbd> open orders · <kbd>?</kbd> help</p>
          <pre>:sell QI-QUAI 100 @ 5
:buy QI-QUAI 100 market_ioc slippage=50bps
:proof trade-000001
:cancel all
:deposit WQI 10 prepare owner-wallet-only
:withdraw WQUAI 1 prepare owner-wallet-only
:api create-key bot-mm-1 prepare owner-wallet-signature-required NO_WITHDRAW
:api revoke-key bot-mm-1 prepare owner-wallet-signature-required NO_ADMIN</pre>
          <div class="mock-trigger">
            <button type="button" data-qdx-trigger-cross>submit mock cross</button>
            <p class="muted" data-qdx-trigger-status>Posts a local/dev GTC sell plus IOC buy with signed slippage bounds; no real Quai tx/explorer/funds.</p>
            <button type="button" data-qdx-trigger-cancel>create + cancel mock order</button>
            <p class="muted" data-qdx-cancel-status>Posts one local/dev resting order, then matcher-local cancellation does not cancel on-chain nonce; no real Quai tx/explorer/funds.</p>
            <button type="button" data-qdx-vault-prepare-deposit>prepare vault deposit</button>
            <p class="muted" data-qdx-vault-deposit-status>Calls prepare-only owner-wallet deposit boundary; no wallet/RPC/signing/broadcast/deploy/tx/funds.</p>
            <button type="button" data-qdx-vault-prepare-withdraw>prepare vault withdrawal</button>
            <p class="muted" data-qdx-vault-withdraw-status>Calls prepare-only owner-wallet withdrawal boundary; delegates cannot deposit or withdraw; no wallet/RPC/signing/broadcast/deploy/tx/funds.</p>
            <button type="button" data-qdx-delegate-key-prepare-register>prepare delegate/API key</button>
            <p class="muted" data-qdx-delegate-key-register-status>Calls prepare-only owner-signed delegate/API key boundary; owner-wallet-signature-required; NO_WITHDRAW/NO_ADMIN; no wallet/RPC/signing/broadcast/deploy/tx/funds.</p>
            <button type="button" data-qdx-delegate-key-prepare-revoke>prepare delegate/API revoke</button>
            <p class="muted" data-qdx-delegate-key-revoke-status>Calls prepare-only owner-signed delegate/API key revocation; no live DelegateKeyRegistry mutation, no wallet/RPC/signing/broadcast/deploy/tx/funds.</p>
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
