import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Heading } from './heading';

describe('Heading text wrapping', () => {
  it('balances multiline headings by default', () => {
    render(<Heading>Tiêu đề nhiều dòng</Heading>);

    expect(screen.getByRole('heading')).toHaveClass('text-balance');
    expect(screen.getByRole('heading')).not.toHaveClass('truncate');
  });

  it('uses an exclusive truncate mode for single-line headings', () => {
    render(<Heading wrap="truncate">Tên khái niệm rất dài</Heading>);

    expect(screen.getByRole('heading')).toHaveClass('truncate');
    expect(screen.getByRole('heading')).not.toHaveClass('text-balance');
  });
});
