import { normalizeAccountOverviewPanelFixture } from './account-overview-panel.js';
import { normalizeCommandPaletteFixture } from './command-palette.js';
import { normalizeDelegateKeyHistoryPanelFixture } from './delegate-key-history-panel.js';
import { normalizeFeePolicyPanelFixture } from './fee-policy-panel.js';
import { normalizeKeyboardShortcutHelpFixture } from './keyboard-shortcuts.js';
import { normalizeKlinePanelFixture } from './kline-panel.js';
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

const renderDelegateKeyHistoryStreamEvents = (events = []) => {
  if (events.length === 0) {
    return '<li class="muted">waiting for private DelegateKeyRegistry history stream snapshot</li>';
  }

  return events.map(({ channel, event }) => `
    <li><span>${escapeHtml(channel)}</span> <code>${escapeHtml(event?.reason ?? 'initial_snapshot')}</code></li>
  `).join('');
};

const renderDelegateKeyHistoryStreamPanel = (delegateKeyHistoryStream) => {
  if (delegateKeyHistoryStream === undefined || delegateKeyHistoryStream === null) {
    return '';
  }

  const permissions = (delegateKeyHistoryStream.permissions ?? []).join(', ');
  const channels = (delegateKeyHistoryStream.channels ?? []).join(', ');
  const projectionSafetyNotices = delegateKeyHistoryStream.projectionSafetyNotices ?? {};

  return `
        <article class="panel stream-panel delegate-key-history-stream-panel">
          <h2>live delegate/API key history streams</h2>
          <p class="warning">${escapeHtml(delegateKeyHistoryStream.safetyNotice)}</p>
          <p class="warning">${escapeHtml(projectionSafetyNotices.registrations ?? '')}</p>
          <p class="warning">${escapeHtml(projectionSafetyNotices.revocations ?? '')}</p>
          <dl class="kv">
            <div><dt>channels</dt><dd>${escapeHtml(channels)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(delegateKeyHistoryStream.source)}</dd></div>
            <div><dt>stream custody</dt><dd>${escapeHtml(delegateKeyHistoryStream.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>settlementMode</dt><dd>${escapeHtml(delegateKeyHistoryStream.settlementMode)}</dd></div>
            <div><dt>delegate can withdraw</dt><dd>${escapeHtml(delegateKeyHistoryStream.delegateCanWithdraw)}</dd></div>
            <div><dt>delegate can admin</dt><dd>${escapeHtml(delegateKeyHistoryStream.delegateCanAdmin)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(delegateKeyHistoryStream.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(delegateKeyHistoryStream.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(delegateKeyHistoryStream.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(delegateKeyHistoryStream.tradingVaultMutation)}</dd></div>
            <div><dt>DelegateKeyRegistry mutation</dt><dd>${escapeHtml(delegateKeyHistoryStream.delegateKeyRegistryMutation)}</dd></div>
            <div><dt>row count</dt><dd>${escapeHtml(delegateKeyHistoryStream.rowCount ?? 0)}</dd></div>
          </dl>
          <h3>private stream events</h3>
          <ul>${renderDelegateKeyHistoryStreamEvents(delegateKeyHistoryStream.streamEvents)}</ul>
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

const renderAccountOverviewRows = (rows = [], emptyLabel, rowLabel = 'row') => {
  if (rows.length === 0) {
    return `<li class="muted">${escapeHtml(emptyLabel)}</li>`;
  }

  return rows.map((row) => `
    <li>
      <span>${escapeHtml(row.marketId ?? row.token ?? row.symbol ?? rowLabel)}</span>
      <span>${escapeHtml(row.status ?? row.available ?? row.amount ?? '0')}</span>
      <code>${escapeHtml(row.orderHash ?? row.fillId ?? row.sourceEventId ?? rowLabel)}</code>
    </li>
  `).join('');
};

const renderAccountOverviewPanel = (accountOverview) => {
  if (accountOverview === undefined || accountOverview === null) {
    return '';
  }

  const overview = normalizeAccountOverviewPanelFixture(accountOverview);
  const permissions = (overview.permissions ?? []).join(', ');
  const balanceRows = overview.balances.balances ?? [];
  const orderRows = overview.orders.open ?? [];
  const fillRows = overview.fills.items ?? [];
  const accountLabel = overview.account === null ? 'null (local/mock)' : overview.account;

  return `
        <article class="panel stream-panel account-overview-panel">
          <h2>read-only account overview</h2>
          <p class="warning">${escapeHtml(overview.safety.notice)}</p>
          <p class="warning">Mock account overview only: no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.</p>
          <dl class="kv">
            <div><dt>account</dt><dd>${escapeHtml(accountLabel)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(overview.source)}</dd></div>
            <div><dt>projection</dt><dd>${escapeHtml(overview.projectionType)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(overview.custody)}</dd></div>
            <div><dt>session</dt><dd>${escapeHtml(overview.session.mode)}</dd></div>
            <div><dt>authenticated</dt><dd>${escapeHtml(overview.session.authenticated)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>balances source</dt><dd>${escapeHtml(overview.balances.source)}</dd></div>
            <div><dt>orders source</dt><dd>${escapeHtml(overview.orders.source)}</dd></div>
            <div><dt>matcher-local orders</dt><dd>${escapeHtml(overview.orders.matcherLocalOnly)}</dd></div>
            <div><dt>fills source</dt><dd>${escapeHtml(overview.fills.source)}</dd></div>
            <div><dt>fill projection</dt><dd>${escapeHtml(overview.fills.projectionType)}</dd></div>
            <div><dt>confirmed-only fills</dt><dd>${escapeHtml(overview.fills.confirmedOnly)}</dd></div>
            <div><dt>settlementMode</dt><dd>${escapeHtml(overview.settlementMode)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(overview.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(overview.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(overview.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(overview.tradingVaultMutation)}</dd></div>
            <div><dt>delegate can withdraw</dt><dd>${escapeHtml(overview.safety.delegateCanWithdraw)}</dd></div>
            <div><dt>delegate can admin</dt><dd>${escapeHtml(overview.safety.delegateCanAdmin)}</dd></div>
            <div><dt>balance rows</dt><dd>${escapeHtml(balanceRows.length)}</dd></div>
            <div><dt>open orders</dt><dd>${escapeHtml(orderRows.length)}</dd></div>
            <div><dt>confirmed fills</dt><dd>${escapeHtml(fillRows.length)}</dd></div>
          </dl>
          <h3>mock vault balances</h3>
          <ul>${renderAccountOverviewRows(balanceRows, 'no mock account balances yet', 'balance')}</ul>
          <h3>matcher-local open orders</h3>
          <ul>${renderAccountOverviewRows(orderRows, 'no matcher-local open orders yet', 'order')}</ul>
          <h3>confirmed indexed fills</h3>
          <ul>${renderAccountOverviewRows(fillRows, 'no confirmed IndexedFillProjection rows yet', 'fill')}</ul>
        </article>
  `;
};

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

const renderDelegateKeyHistoryRows = (rows = [], emptyLabel) => {
  if (rows.length === 0) {
    return `<li class="muted">${escapeHtml(emptyLabel)}</li>`;
  }

  return rows.map((row) => `
    <li>
      <span>${escapeHtml(row.eventName ?? row.projectionType ?? 'DelegateKeyRegistry event')}</span>
      <span>${escapeHtml(row.delegate ?? row.keyId ?? 'delegate-key')}</span>
      <span>${escapeHtml(row.allowedMarketsHash ?? row.maxNotional ?? 'metadata-only')}</span>
      <code>${escapeHtml(row.sourceEventId ?? 'mock-event-pending')}</code>
    </li>
  `).join('');
};

const renderDelegateKeyHistorySection = ({ title, envelope, rows, emptyLabel }) => {
  const permissions = (envelope.permissions ?? []).join(', ');

  return `
          <section class="delegate-key-history-section">
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
              <div><dt>delegate can withdraw</dt><dd>${escapeHtml(envelope.delegateCanWithdraw)}</dd></div>
              <div><dt>delegate can admin</dt><dd>${escapeHtml(envelope.delegateCanAdmin)}</dd></div>
              <div><dt>real Quai tx</dt><dd>${escapeHtml(envelope.realQuaiTransactions)}</dd></div>
              <div><dt>wallet required</dt><dd>${escapeHtml(envelope.walletRequired)}</dd></div>
              <div><dt>funds moved</dt><dd>${escapeHtml(envelope.fundsMoved)}</dd></div>
              <div><dt>TradingVault mutation</dt><dd>${escapeHtml(envelope.tradingVaultMutation)}</dd></div>
              <div><dt>DelegateKeyRegistry mutation</dt><dd>${escapeHtml(envelope.delegateKeyRegistryMutation)}</dd></div>
            </dl>
            <ul>${renderDelegateKeyHistoryRows(rows, emptyLabel)}</ul>
          </section>
  `;
};

const renderDelegateKeyHistoryPanel = (delegateKeyHistory) => {
  if (delegateKeyHistory === undefined || delegateKeyHistory === null) {
    return '';
  }

  const history = normalizeDelegateKeyHistoryPanelFixture(delegateKeyHistory);

  return `
        <article class="panel stream-panel delegate-key-history-panel">
          <h2>read-only delegate/API key history</h2>
${renderDelegateKeyHistorySection({
    title: 'DelegateKeyRegistered history',
    envelope: history.registrations,
    rows: history.registrations.registrations,
    emptyLabel: 'no delegate-key registration history rows yet',
  })}
${renderDelegateKeyHistorySection({
    title: 'DelegateKeyRevoked history',
    envelope: history.revocations,
    rows: history.revocations.revocations,
    emptyLabel: 'no delegate-key revocation history rows yet',
  })}
        </article>
  `;
};

const localMockEvidenceLabel = (value) => value ?? 'null (local/mock)';

const renderFeeScheduleRows = (rows = []) => rows.map((row) => `
    <li>
      <span>${escapeHtml(row.marketId)}</span>
      <span>maker fee bps ${escapeHtml(row.makerFeeBps)}</span>
      <span>taker fee bps ${escapeHtml(row.takerFeeBps)}</span>
      <code>${escapeHtml(row.eventName)}</code>
    </li>
  `).join('');

const renderFeePolicyPanel = (feePolicy) => {
  if (feePolicy === undefined || feePolicy === null) {
    return '';
  }

  const policy = normalizeFeePolicyPanelFixture(feePolicy);
  const permissions = (policy.permissions ?? []).join(', ');
  const rows = policy.feeSchedules ?? [];
  const firstSchedule = rows[0] ?? {};

  return `
        <article class="panel stream-panel fee-policy-panel">
          <h2>read-only FeeManager fee schedule</h2>
          <p class="warning">${escapeHtml(policy.safety.notice)}</p>
          <dl class="kv">
            <div><dt>source</dt><dd>${escapeHtml(policy.source)}</dd></div>
            <div><dt>status</dt><dd>${escapeHtml(policy.status)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(policy.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>hard max fee bps</dt><dd>${escapeHtml(policy.hardMaxFeeBps)}</dd></div>
            <div><dt>fee recipient</dt><dd>${escapeHtml(localMockEvidenceLabel(policy.feeRecipient))}</dd></div>
            <div><dt>feeManagerMutation</dt><dd>${escapeHtml(policy.feeManagerMutation)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(policy.tradingVaultMutation)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(policy.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(policy.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(policy.fundsMoved)}</dd></div>
          </dl>
          <h3>FeeScheduleProjection</h3>
          <dl class="kv">
            <div><dt>projection</dt><dd>${escapeHtml(firstSchedule.projectionType ?? 'FeeScheduleProjection')}</dd></div>
            <div><dt>event</dt><dd>${escapeHtml(firstSchedule.eventName ?? 'FeesUpdated')}</dd></div>
            <div><dt>settlementMode</dt><dd>${escapeHtml(firstSchedule.settlementMode ?? 'mock')}</dd></div>
            <div><dt>settlement tx</dt><dd><code>${escapeHtml(localMockEvidenceLabel(firstSchedule.settlementTx))}</code></dd></div>
            <div><dt>block</dt><dd>${escapeHtml(localMockEvidenceLabel(firstSchedule.blockNumber))}</dd></div>
            <div><dt>event index</dt><dd>${escapeHtml(localMockEvidenceLabel(firstSchedule.eventIndex))}</dd></div>
            <div><dt>explorer</dt><dd>${escapeHtml(localMockEvidenceLabel(firstSchedule.explorerUrl))}</dd></div>
          </dl>
          <ul>${renderFeeScheduleRows(rows)}</ul>
        </article>
  `;
};

const renderFeePolicyStreamPanel = (feePolicyStream) => {
  if (feePolicyStream === undefined || feePolicyStream === null) {
    return '';
  }

  const permissions = (feePolicyStream.permissions ?? []).join(', ');
  const streamReason = feePolicyStream.streamEvent?.reason ?? 'initial_snapshot';

  return `
        <article class="panel stream-panel fee-policy-stream-panel">
          <h2>live FeeManager fee schedule stream</h2>
          <p class="warning">${escapeHtml(feePolicyStream.safetyNotice)}</p>
          <p class="warning">${escapeHtml(feePolicyStream.projectionSafetyNotice ?? '')}</p>
          <dl class="kv">
            <div><dt>channel</dt><dd>${escapeHtml(feePolicyStream.channel)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(feePolicyStream.source)}</dd></div>
            <div><dt>stream custody</dt><dd>${escapeHtml(feePolicyStream.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>projection</dt><dd>${escapeHtml(feePolicyStream.projectionType)}</dd></div>
            <div><dt>event</dt><dd>${escapeHtml(feePolicyStream.eventName)}</dd></div>
            <div><dt>hard max fee bps</dt><dd>${escapeHtml(feePolicyStream.hardMaxFeeBps)}</dd></div>
            <div><dt>fee recipient</dt><dd>${escapeHtml(localMockEvidenceLabel(feePolicyStream.feeRecipient))}</dd></div>
            <div><dt>row count</dt><dd>${escapeHtml(feePolicyStream.rowCount ?? 0)}</dd></div>
            <div><dt>settlementMode</dt><dd>${escapeHtml(feePolicyStream.settlementMode)}</dd></div>
            <div><dt>feeManagerMutation</dt><dd>${escapeHtml(feePolicyStream.feeManagerMutation)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(feePolicyStream.tradingVaultMutation)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(feePolicyStream.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(feePolicyStream.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(feePolicyStream.fundsMoved)}</dd></div>
            <div><dt>fee-authority runtime keys</dt><dd>${escapeHtml(feePolicyStream.noFeeAuthorityRuntimeKeys ? 'absent' : 'unsafe')}</dd></div>
            <div><dt>last event</dt><dd>${escapeHtml(streamReason)}</dd></div>
          </dl>
        </article>
  `;
};

const renderPublicMarketDataStreamEvents = (events = []) => {
  if (events.length === 0) {
    return '<li class="muted">waiting for public market-data stream snapshots</li>';
  }

  return events.map(({ channel, event }) => `
    <li><span>${escapeHtml(channel)}</span> <code>${escapeHtml(event?.reason ?? 'initial_snapshot')}</code></li>
  `).join('');
};

const renderPublicMarketDataStreamPanel = (publicMarketDataStream) => {
  if (publicMarketDataStream === undefined || publicMarketDataStream === null) {
    return '';
  }

  const channels = (publicMarketDataStream.channels ?? []).join(', ');
  const payloads = (publicMarketDataStream.payloads ?? []).join(', ');
  const sources = (publicMarketDataStream.sources ?? []).join(', ');
  const permissions = (publicMarketDataStream.permissions ?? []).join(', ');

  return `
        <article class="panel stream-panel public-market-data-stream-panel">
          <h2>live public market-data streams</h2>
          <p class="warning">${escapeHtml(publicMarketDataStream.safetyNotice)}</p>
          <dl class="kv">
            <div><dt>channels</dt><dd>${escapeHtml(channels)}</dd></div>
            <div><dt>payloads</dt><dd>${escapeHtml(payloads)}</dd></div>
            <div><dt>sources</dt><dd>${escapeHtml(sources)}</dd></div>
            <div><dt>stream custody</dt><dd>${escapeHtml(publicMarketDataStream.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>market</dt><dd>${escapeHtml(publicMarketDataStream.marketId)}</dd></div>
            <div><dt>tickers</dt><dd>${escapeHtml(publicMarketDataStream.tickerCount ?? 0)}</dd></div>
            <div><dt>bids</dt><dd>${escapeHtml(publicMarketDataStream.bidCount ?? 0)}</dd></div>
            <div><dt>asks</dt><dd>${escapeHtml(publicMarketDataStream.askCount ?? 0)}</dd></div>
            <div><dt>trades</dt><dd>${escapeHtml(publicMarketDataStream.tradeCount ?? 0)}</dd></div>
            <div><dt>finality</dt><dd>${escapeHtml(publicMarketDataStream.finality ?? 'confirmed-settlement-only')}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(publicMarketDataStream.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(publicMarketDataStream.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(publicMarketDataStream.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(publicMarketDataStream.tradingVaultMutation)}</dd></div>
          </dl>
          <h3>public stream events</h3>
          <ul>${renderPublicMarketDataStreamEvents(publicMarketDataStream.streamEvents)}</ul>
        </article>
  `;
};

const renderKlineRows = (candles = []) => {
  if (candles.length === 0) {
    return '<li class="muted">no local/mock candle rows yet</li>';
  }

  return candles.map((candle) => `
    <li>
      <span>${escapeHtml(candle.openTime ?? candle.timestamp ?? 'local-candle')}</span>
      <span>${escapeHtml(candle.open ?? '0')}</span>
      <span>${escapeHtml(candle.close ?? '0')}</span>
    </li>
  `).join('');
};

const renderKlinePanel = (klines) => {
  if (klines === undefined || klines === null) {
    return '';
  }

  const panel = normalizeKlinePanelFixture(klines);
  const permissions = (panel.permissions ?? []).join(', ');

  return `
        <article class="panel stream-panel kline-panel">
          <h2>read-only public kline/candle panel</h2>
          <p class="warning">${escapeHtml(panel.safety.notice)}</p>
          <dl class="kv">
            <div><dt>market</dt><dd>${escapeHtml(panel.marketId)}</dd></div>
            <div><dt>interval</dt><dd>${escapeHtml(panel.interval)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(panel.source)}</dd></div>
            <div><dt>payload</dt><dd>${escapeHtml(panel.payload)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(panel.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>candles</dt><dd>${escapeHtml(panel.candles.length)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(panel.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(panel.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(panel.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(panel.tradingVaultMutation)}</dd></div>
            <div><dt>custody authority</dt><dd>${escapeHtml(panel.safety.noCustodyAuthority ? 'no custody authority' : 'unsafe')}</dd></div>
          </dl>
          <h3>kline_snapshot rows</h3>
          <ul>${renderKlineRows(panel.candles)}</ul>
        </article>
  `;
};

const renderKlineStreamPanel = (klineStream) => {
  if (klineStream === undefined || klineStream === null) {
    return '';
  }

  const permissions = (klineStream.permissions ?? []).join(', ');
  const streamReason = klineStream.streamEvent?.reason ?? 'initial_snapshot';

  return `
        <article class="panel stream-panel kline-stream-panel">
          <h2>live public kline/candle stream</h2>
          <p class="warning">${escapeHtml(klineStream.safetyNotice)}</p>
          <p class="warning">${escapeHtml(klineStream.projectionSafetyNotice ?? '')}</p>
          <dl class="kv">
            <div><dt>channel</dt><dd>${escapeHtml(klineStream.channel)}</dd></div>
            <div><dt>source</dt><dd>${escapeHtml(klineStream.source)}</dd></div>
            <div><dt>payload</dt><dd>${escapeHtml(klineStream.payload)}</dd></div>
            <div><dt>stream custody</dt><dd>${escapeHtml(klineStream.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>market</dt><dd>${escapeHtml(klineStream.marketId)}</dd></div>
            <div><dt>interval</dt><dd>${escapeHtml(klineStream.interval)}</dd></div>
            <div><dt>candles</dt><dd>${escapeHtml(klineStream.candleCount ?? 0)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(klineStream.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(klineStream.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(klineStream.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(klineStream.tradingVaultMutation)}</dd></div>
            <div><dt>last event</dt><dd>${escapeHtml(streamReason)}</dd></div>
          </dl>
        </article>
  `;
};

const renderCommandPaletteRows = (commands = []) => commands.map((command) => `
  <li>
    <code>${escapeHtml(command.command)}</code>
    <span>${escapeHtml(command.actionType)}</span>
    <span>${escapeHtml(command.surface)}</span>
    <span>${escapeHtml(command.dispatchMode)}</span>
  </li>
`).join('');

const renderCommandPalettePanel = (commandPalette) => {
  if (commandPalette === undefined || commandPalette === null) {
    return '';
  }

  const panel = normalizeCommandPaletteFixture(commandPalette);
  const permissions = (panel.permissions ?? []).join(', ');

  return `
        <article class="panel command-palette-skeleton-panel">
          <h2>terminal command-palette skeleton</h2>
          <p class="warning">${escapeHtml(panel.safety.notice)}</p>
          <dl class="kv">
            <div><dt>source</dt><dd>${escapeHtml(panel.source)}</dd></div>
            <div><dt>mode</dt><dd>${escapeHtml(panel.mode)}</dd></div>
            <div><dt>dispatch</dt><dd>${escapeHtml(panel.dispatchMode)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(panel.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(panel.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(panel.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(panel.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(panel.tradingVaultMutation)}</dd></div>
            <div><dt>MarketRegistry mutation</dt><dd>${escapeHtml(panel.marketRegistryMutation)}</dd></div>
            <div><dt>DelegateKeyRegistry mutation</dt><dd>${escapeHtml(panel.delegateKeyRegistryMutation)}</dd></div>
            <div><dt>delegate can withdraw</dt><dd>${escapeHtml(panel.delegateCanWithdraw)}</dd></div>
            <div><dt>delegate can admin</dt><dd>${escapeHtml(panel.delegateCanAdmin)}</dd></div>
          </dl>
          <form data-qdx-command-palette-form>
            <label>
              command
              <input data-qdx-command-palette-input value=":proof trade-000001" aria-label="terminal command palette input" />
            </label>
            <button type="submit">preview command</button>
          </form>
          <p class="muted" data-qdx-command-palette-status>Preview-only skeleton: choose a known command; no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.</p>
          <h3>previewable commands</h3>
          <ul>${renderCommandPaletteRows(panel.commands)}</ul>
          <p class="warning">Matcher-local cancellation does not mutate on-chain NonceManager nonces. Delegate/API key commands keep delegate can withdraw false and delegate can admin false.</p>
        </article>
  `;
};

const renderKeyboardShortcutRows = (shortcuts = []) => shortcuts.map((shortcut) => `
  <li>
    <span><kbd>${escapeHtml(shortcut.key)}</kbd> ${escapeHtml(shortcut.label)}</span>
    <span class="muted">${escapeHtml(`${shortcut.key} ${shortcut.label}`)}</span>
    <span>${escapeHtml(shortcut.actionType)}</span>
    <span>${escapeHtml(shortcut.surface)}</span>
    <span>${escapeHtml(shortcut.dispatchMode)}</span>
  </li>
`).join('');

const renderKeyboardCommandHintRows = (commandHints = []) => commandHints.map((hint) => `
  <li>
    <code>${escapeHtml(hint.command)}</code>
    <span>${escapeHtml(hint.actionType)}</span>
    <span>${escapeHtml(hint.surface)}</span>
    <span>${escapeHtml(hint.dispatchMode)}</span>
  </li>
`).join('');

const renderKeyboardShortcutHelpPanel = (keyboardShortcuts) => {
  if (keyboardShortcuts === undefined || keyboardShortcuts === null) {
    return '';
  }

  const panel = normalizeKeyboardShortcutHelpFixture(keyboardShortcuts);
  const permissions = (panel.permissions ?? []).join(', ');

  return `
        <article class="panel command-panel keyboard-shortcut-help-panel" data-qdx-keyboard-shortcuts-panel>
          <h2>terminal keyboard-shortcut help</h2>
          <p class="warning">${escapeHtml(panel.safety.notice)}</p>
          <p class="muted" data-qdx-keyboard-shortcuts-status>Waiting for local API keyboard-shortcut help smoke; help-only-no-dispatch and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.</p>
          <dl class="kv">
            <div><dt>source</dt><dd>${escapeHtml(panel.source)}</dd></div>
            <div><dt>mode</dt><dd>${escapeHtml(panel.mode)}</dd></div>
            <div><dt>dispatch</dt><dd>${escapeHtml(panel.dispatchMode)}</dd></div>
            <div><dt>panel trigger</dt><dd>${escapeHtml(panel.panelTrigger)}</dd></div>
            <div><dt>custody</dt><dd>${escapeHtml(panel.custody)}</dd></div>
            <div><dt>permissions</dt><dd>${escapeHtml(permissions)}</dd></div>
            <div><dt>real Quai tx</dt><dd>${escapeHtml(panel.realQuaiTransactions)}</dd></div>
            <div><dt>wallet required</dt><dd>${escapeHtml(panel.walletRequired)}</dd></div>
            <div><dt>funds moved</dt><dd>${escapeHtml(panel.fundsMoved)}</dd></div>
            <div><dt>TradingVault mutation</dt><dd>${escapeHtml(panel.tradingVaultMutation)}</dd></div>
            <div><dt>MarketRegistry mutation</dt><dd>${escapeHtml(panel.marketRegistryMutation)}</dd></div>
            <div><dt>DelegateKeyRegistry mutation</dt><dd>${escapeHtml(panel.delegateKeyRegistryMutation)}</dd></div>
            <div><dt>delegate can withdraw</dt><dd>${escapeHtml(panel.delegateCanWithdraw)}</dd></div>
            <div><dt>delegate can admin</dt><dd>${escapeHtml(panel.delegateCanAdmin)}</dd></div>
          </dl>
          <h3>shortcuts</h3>
          <ul>${renderKeyboardShortcutRows(panel.shortcuts)}</ul>
          <h3>command hints</h3>
          <ul>${renderKeyboardCommandHintRows(panel.commandHints)}</ul>
          <p class="warning">Matcher-local cancellation does not mutate on-chain NonceManager nonces. Owner-wallet prepare hints remain no wallet/RPC/signing/broadcast/deploy/tx/funds behavior. Delegate/API key hints keep delegate can withdraw false and delegate can admin false.</p>
          <pre>:sell QI-QUAI 100 @ 5
:buy QI-QUAI 100 market_ioc slippage=50bps
:proof trade-000001
:cancel all matcher-local
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

${renderAccountOverviewPanel(fixture.accountOverview)}

${renderVaultOperationPanel(fixture.vaultOperation)}

${renderDelegateKeyOperationPanel(fixture.delegateKeyOperation)}

${renderDelegateKeyHistoryPanel(fixture.delegateKeyHistory)}

${renderFeePolicyPanel(fixture.feePolicy)}

${renderKlinePanel(fixture.klines)}

${renderFeePolicyStreamPanel(fixture.feePolicyStream)}

${renderKlineStreamPanel(fixture.klineStream)}

${renderPublicMarketDataStreamPanel(fixture.publicMarketDataStream)}

${renderDelegateKeyHistoryStreamPanel(fixture.delegateKeyHistoryStream)}

${renderVaultHistoryStreamPanel(fixture.vaultHistoryStream)}

${renderVaultHistoryPanel(fixture.vaultHistory)}

${renderCommandPalettePanel(fixture.commandPalette)}

${renderKeyboardShortcutHelpPanel(fixture.keyboardShortcuts)}

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
