import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { AttendeeProfile } from './AttendeeProfile';
import { SeatGrid } from './SeatGrid';

const auditorium = {
  sections: [
    { id: 'front', label: 'Front Row', color: '#c9a84c' },
  ],
  default_seating_config: {
    front: { rows: 1, cols: 2 },
  },
};

describe('seating display', () => {
  it('renders occupied seats with the dignitary image and name', () => {
    const { container } = render(
      <SeatGrid
        auditorium={auditorium}
        sectionId="front"
        attendees={[
          {
            id: 'dignitary-1',
            name: 'Pastor Ada Grace',
            picture_url: 'https://example.com/ada.jpg',
            section: 'front',
            row_num: 1,
            col_num: 1,
            status: 'seated',
          },
        ]}
        onSeatClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Pastor Ada Grace')).toBeInTheDocument();
    expect(container.querySelector('.seat-avatar img')).toHaveAttribute('src', 'https://example.com/ada.jpg');
  });

  it('shows a profile seating action when the dignitary has a seat', () => {
    const onLocateSeat = vi.fn();

    render(
      <AttendeeProfile
        auditorium={auditorium}
        atn={{
          id: 'dignitary-1',
          name: 'Pastor Ada Grace',
          title: 'Pastor',
          section: 'front',
          row_num: 1,
          col_num: 1,
          status: 'seated',
        }}
        canEdit={false}
        canRemoveFromMap={false}
        canManageStatus={false}
        onLocateSeat={onLocateSeat}
        onStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Seating' }));
    expect(onLocateSeat).toHaveBeenCalledWith(expect.objectContaining({ id: 'dignitary-1' }));
  });
});
