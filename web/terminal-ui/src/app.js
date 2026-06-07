import { bindLiveFillStream } from './live-fills.js';
import { bindLiveOrderStream } from './live-orders.js';
import { bindMockOrderTrigger } from './mock-order-trigger.js';
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
    bindLiveOrderStream({
      mount,
      baseUrl,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onError: (error) => {
        mount.dataset.qdxLiveOrdersStream = 'error';
        console.warn('QDEX live orders stream unavailable; keeping static mock fixture.', error);
      },
      onUpdate: () => {
        mount.dataset.qdxLiveOrdersStream = 'orders';
      },
    });
  } catch (error) {
    mount.dataset.qdxLiveOrdersStream = 'disabled';
    console.warn('QDEX live orders stream disabled; keeping static mock fixture.', error);
  }
}
