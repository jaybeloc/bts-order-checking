import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import App from '../App';

it('renders the empty state without throwing', () => {
  const html = renderToString(<App />);
  expect(html).toContain('Load the morning export');
  expect(html).toContain('Unfinished sales');
});
