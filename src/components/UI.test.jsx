import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FormField, Loader, Modal, ModalHeader, RoleTag, Toast } from './UI';

describe('UI components', () => {
  it('renders the loader with custom text', () => {
    render(<Loader text="Loading directory..." />);

    expect(screen.getByText('Loading directory...')).toBeInTheDocument();
  });

  it('renders role labels for known roles and fallback for unknown roles', () => {
    const { rerender } = render(<RoleTag role="admin" />);
    expect(screen.getByText('Admin')).toBeInTheDocument();

    rerender(<RoleTag role="protocol" />);
    expect(screen.getByText('protocol')).toBeInTheDocument();

    rerender(<RoleTag role="something-else" />);
    expect(screen.getByText('Loading Role')).toBeInTheDocument();
  });

  it('renders a labelled form field wrapper', () => {
    render(
      <FormField label="Full Name">
        <input aria-label="Full Name Input" />
      </FormField>,
    );

    expect(screen.getByText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Full Name Input')).toBeInTheDocument();
  });

  it('closes the modal only when the overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <div>Modal body</div>
      </Modal>,
    );

    fireEvent.click(screen.getByText('Modal body'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Modal body').parentElement.parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders modal header copy and closes from the action button', () => {
    const onClose = vi.fn();
    render(<ModalHeader title="Edit Session" sub="Session details" onClose={onClose} />);

    expect(screen.getByText('Edit Session')).toBeInTheDocument();
    expect(screen.getByText('Session details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders toast messages', () => {
    render(<Toast msg="Saved successfully" type="success" />);

    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });
});
