import { bindLiveBalanceStreamWithAccountSnapshot } from './balance-stream-binding.js';
import { bindMockCancelTriggerWithOrderStream } from './cancel-stream-binding.js';
import { bindLiveFillStream } from './live-fills.js';
import { bindMockOrderTrigger } from './mock-order-trigger.js';
import { bindVaultPrepareTriggerWithLocalApiSmoke } from './vault-prepare-binding.js';
import { mockVerticalSliceFixture } from './mock-vertical-fixture.js';
import { renderTradeProofPanel } from './render.js';

const mount = document.querySelector('[data-qdx-app]');

if (mount) {
  const baseUrl = mount.dataset.qdxStreamBaseUrl || globalThis.QDEX_STREAM_BASE_URL || 'http://127.0.0.1:8787';

  mount.innerHTML = renderTradeProofPanel(mockVerticalSliceFixture);

  try {
    bindMockOrderTrigger({
      mount,
      baseUrl,
      onError: (error) => {
        mount.dataset.qdxMockOrderTrigger = 'error';
        console.warn('QDEX mock order trigger failed; no real Quai transaction was attempted.', error);
      },
      onSmoke: () => {
        mount.dataset.qdxMockOrderTrigger = 'filled';
      },
    });
  } catch (error) {
    mount.dataset.qdxMockOrderTrigger = 'disabled';
    console.warn('QDEX mock order trigger disabled.', error);
  }

  try {
    bindMockCancelTriggerWithOrderStream({
      mount,
      baseUrl,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onCancelError: (error) => {
        mount.dataset.qdxMockCancelTrigger = 'error';
        console.warn('QDEX mock cancel trigger failed; no on-chain nonce cancellation or real Quai transaction was attempted.', error);
      },
      onCancel: () => {
        mount.dataset.qdxMockCancelTrigger = 'cancelled';
      },
      onStreamError: (error) => {
        mount.dataset.qdxLiveOrdersStream = 'error';
        console.warn('QDEX live orders stream unavailable; keeping static mock fixture.', error);
      },
      onStreamUpdate: () => {
        mount.dataset.qdxLiveOrdersStream = 'orders';
      },
    });
  } catch (error) {
    mount.dataset.qdxMockCancelTrigger = 'disabled';
    mount.dataset.qdxLiveOrdersStream = 'disabled';
    console.warn('QDEX local cancel/order-stream smoke disabled.', error);
  }

  try {
    bindVaultPrepareTriggerWithLocalApiSmoke({
      mount,
      baseUrl,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onError: (error) => {
        mount.dataset.qdxVaultPrepareTrigger = 'error';
        console.warn('QDEX vault prepare trigger failed; no wallet, RPC, signing, broadcast, transaction, or funds behavior was attempted.', error);
      },
      onPrepare: () => {
        mount.dataset.qdxVaultPrepareTrigger = 'prepare-only';
      },
    });
  } catch (error) {
    mount.dataset.qdxVaultPrepareTrigger = 'disabled';
    console.warn('QDEX vault prepare trigger disabled; keeping owner-wallet boundary prepare-only.', error);
  }

  try {
    bindLiveFillStream({
      mount,
      baseUrl,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onError: (error) => {
        mount.dataset.qdxLiveStream = 'error';
        console.warn('QDEX live fills stream unavailable; keeping static mock fixture.', error);
      },
      onUpdate: () => {
        mount.dataset.qdxLiveStream = 'fills';
      },
    });
  } catch (error) {
    mount.dataset.qdxLiveStream = 'disabled';
    console.warn('QDEX live fills stream disabled; keeping static mock fixture.', error);
  }

  try {
    bindLiveBalanceStreamWithAccountSnapshot({
      mount,
      baseUrl,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestError: (error) => {
        mount.dataset.qdxBalanceRestSnapshot = 'error';
        console.warn('QDEX account balance snapshot unavailable; keeping static mock fixture.', error);
      },
      onStreamError: (error) => {
        mount.dataset.qdxLiveBalancesStream = 'error';
        console.warn('QDEX live balances stream unavailable; keeping static mock fixture.', error);
      },
      onStreamUpdate: () => {
        mount.dataset.qdxLiveBalancesStream = 'balances';
      },
    }).catch((error) => {
      mount.dataset.qdxLiveBalancesStream = 'disabled';
      console.warn('QDEX local balances API/stream smoke disabled; keeping static mock fixture.', error);
    });
  } catch (error) {
    mount.dataset.qdxLiveBalancesStream = 'disabled';
    console.warn('QDEX live balances stream disabled; keeping static mock fixture.', error);
  }
}
