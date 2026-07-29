import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MeasurementSelector } from '../ude_editor/MeasurementSelector';
import { MeasurementDetail, MeasurementFamily } from '../dictionary_service';

function measurement(name: string, display: string, family: number): MeasurementDetail {
  return {
    name,
    display_name: display,
    family,
    description: '',
    dimensions: [],
    metrics: [],
  };
}

const MEASUREMENTS: MeasurementDetail[] = [
  measurement('/traffic', 'Traffic', MeasurementFamily.TRAFFIC),
  measurement('/nms/device_metrics', 'NMS Device Metrics', MeasurementFamily.NMS),
  measurement('/nms/interfaces', 'NMS Interfaces', MeasurementFamily.NMS_INTERFACES),
  measurement('/synthetics/http', 'Synthetics HTTP', MeasurementFamily.SYNTHETICS),
];

describe('MeasurementSelector', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(<MeasurementSelector measurements={MEASUREMENTS} value="" onChange={jest.fn()} isLoading={false} />);
    expect(screen.getByText('Select measurement...')).toBeInTheDocument();
  });

  it('shows the selected measurement label', () => {
    render(
      <MeasurementSelector measurements={MEASUREMENTS} value="/traffic" onChange={jest.fn()} isLoading={false} />
    );
    expect(screen.getByText('Traffic')).toBeInTheDocument();
  });

  it('groups measurements by family with family headers', () => {
    render(<MeasurementSelector measurements={MEASUREMENTS} value="" onChange={jest.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /select measurement/i }));

    // Family section headers are rendered as buttons with a count.
    expect(screen.getByRole('button', { name: /Traffic 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NMS 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Synthetics 1/i })).toBeInTheDocument();
  });

  it('collapses and expands a family section', () => {
    render(<MeasurementSelector measurements={MEASUREMENTS} value="" onChange={jest.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /select measurement/i }));

    // The Traffic option is visible initially.
    expect(screen.getByRole('option', { name: 'Traffic' })).toBeInTheDocument();

    // Collapsing the Traffic family hides its option.
    fireEvent.click(screen.getByRole('button', { name: /Traffic 1/i }));
    expect(screen.queryByRole('option', { name: 'Traffic' })).not.toBeInTheDocument();

    // Expanding shows it again.
    fireEvent.click(screen.getByRole('button', { name: /Traffic 1/i }));
    expect(screen.getByRole('option', { name: 'Traffic' })).toBeInTheDocument();
  });

  it('filters measurements via search across families', () => {
    render(<MeasurementSelector measurements={MEASUREMENTS} value="" onChange={jest.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /select measurement/i }));

    fireEvent.change(screen.getByPlaceholderText('Search measurements...'), { target: { value: 'nms' } });

    expect(screen.getByRole('option', { name: 'NMS Device Metrics' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'NMS Interfaces' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Traffic' })).not.toBeInTheDocument();
  });

  it('calls onChange and closes when an option is selected', () => {
    const onChange = jest.fn();
    render(<MeasurementSelector measurements={MEASUREMENTS} value="" onChange={onChange} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /select measurement/i }));

    fireEvent.click(screen.getByRole('option', { name: 'Synthetics HTTP' }));

    expect(onChange).toHaveBeenCalledWith('/synthetics/http');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navigates and selects with the keyboard', () => {
    const onChange = jest.fn();
    render(<MeasurementSelector measurements={MEASUREMENTS} value="" onChange={onChange} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /select measurement/i }));

    const searchInput = screen.getByPlaceholderText('Search measurements...');

    // Row 0 is the first family header (Traffic); ArrowDown moves to its option.
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('/traffic');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('collapses a family with ArrowLeft on its header', () => {
    render(<MeasurementSelector measurements={MEASUREMENTS} value="" onChange={jest.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /select measurement/i }));

    const searchInput = screen.getByPlaceholderText('Search measurements...');
    expect(screen.getByRole('option', { name: 'Traffic' })).toBeInTheDocument();

    // Active row starts on the first header (Traffic). ArrowLeft collapses it.
    fireEvent.keyDown(searchInput, { key: 'ArrowLeft' });
    expect(screen.queryByRole('option', { name: 'Traffic' })).not.toBeInTheDocument();

    // ArrowRight expands it again.
    fireEvent.keyDown(searchInput, { key: 'ArrowRight' });
    expect(screen.getByRole('option', { name: 'Traffic' })).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<MeasurementSelector measurements={MEASUREMENTS} value="" onChange={jest.fn()} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /select measurement/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByPlaceholderText('Search measurements...'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
