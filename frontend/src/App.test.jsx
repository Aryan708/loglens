import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

const SAMPLE = [
  '2026-03-14 10:00:00,000 INFO [api] Server started',
  '2026-03-14 10:00:30,000 WARN [api] Slow request 1200ms',
  '2026-03-14 10:01:00,000 ERROR [payment] Timeout after 3000ms for order 1',
  'java.net.SocketTimeoutException: Read timed out',
  '    at Client.charge(Client.java:42)',
  '2026-03-14 10:01:30,000 ERROR [payment] Timeout after 5000ms for order 2',
  '2026-03-14 10:02:00,000 INFO [cart] Item added',
].join('\n');

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => SAMPLE });
});

async function loadSample(user) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Try the sample log' }));
  return screen.findByRole('heading', { level: 1, name: 'sample-app.log' });
}

describe('App', () => {
  it('shows the upload screen first', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Find the problem in your logs/ })).toBeInTheDocument();
    expect(screen.getByText('Browser mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose file')).toBeInTheDocument();
  });

  it('analyzes the sample log and moves focus to the results', async () => {
    const user = userEvent.setup();
    const heading = await loadSample(user);

    expect(heading).toHaveFocus();
    expect(screen.getByText('Formats detected: standard')).toBeInTheDocument();
    const summary = screen.getByLabelText('Log summary');
    expect(within(summary).getByText('Errors').nextSibling.querySelector('.card__value')).toHaveTextContent('2');
    expect(screen.getByText('Timeout after <NUM>ms for order <NUM>')).toBeInTheDocument();
    expect(screen.getByText('5 matching entries')).toBeInTheDocument();
  });

  it('filters by level and search, then clears filters', async () => {
    const user = userEvent.setup();
    await loadSample(user);

    await user.click(screen.getByRole('button', { name: /^ERROR/ }));
    expect(screen.getByText('2 matching entries')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '5000ms');
    expect(await screen.findByText('1 matching entries')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(screen.getByText('5 matching entries')).toBeInTheDocument();
  });

  it('jumps from a recurring error pattern to its entries', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(screen.getByRole('button', { name: 'Show matching entries' }));
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('Timeout after');
    expect(await screen.findByText('2 matching entries')).toBeInTheDocument();
  });

  it('filters the table to a time bucket from the chart', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    const chart = screen.getByRole('group', { name: 'Log entries over time' });
    const bars = within(chart).getAllByRole('button');
    await user.click(bars[0]);
    expect(screen.getByRole('button', { name: 'Clear time range' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear time range' }));
    expect(screen.queryByRole('button', { name: 'Clear time range' })).not.toBeInTheDocument();
  });

  it('analyzes an uploaded file and can start over', async () => {
    const user = userEvent.setup();
    render(<App />);
    const file = new File([SAMPLE], 'server.log', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Choose file'), file);

    expect(await screen.findByRole('heading', { level: 1, name: 'server.log' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Analyze another file' }));
    expect(screen.getByRole('heading', { name: /Find the problem in your logs/ })).toBeInTheDocument();
  });

  it('analyzes pasted text', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText('Or paste log lines'));
    await user.type(screen.getByLabelText('Log text'), '2026-03-14T10:00:00Z FATAL [db] Disk full');
    await user.click(screen.getByRole('button', { name: 'Analyze text' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'pasted.log' })).toBeInTheDocument();
    expect(screen.getByText('Disk full', { selector: 'code' })).toBeInTheDocument();
  });

  it('shows an error for files too large for browser mode', async () => {
    const user = userEvent.setup();
    render(<App />);
    const big = new File(['x'], 'huge.log', { type: 'text/plain' });
    Object.defineProperty(big, 'size', { value: 30 * 1024 * 1024 });
    await user.upload(screen.getByLabelText('Choose file'), big);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not analyze huge.log. File is 30.0 MB');
  });
});
