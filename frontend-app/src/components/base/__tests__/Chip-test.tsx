import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Chip } from '../Chip';

describe('Chip', () => {
  it('renders children text', () => {
    render(<Chip>My Label</Chip>);
    expect(screen.getByText('My Label')).toBeTruthy();
  });

  it('renders title when provided', () => {
    render(<Chip title="Title Text">Content</Chip>);
    expect(screen.getByText('Title Text')).toBeTruthy();
  });

  it('renders without title by default', () => {
    render(<Chip>No Title</Chip>);
    expect(screen.queryByText('Title Text')).toBeNull();
  });

  it('calls onPress handler when pressed', () => {
    const onPress = jest.fn();
    render(<Chip onPress={onPress}>Press Me</Chip>);
    fireEvent.press(screen.getByText('Press Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders correctly with error prop', () => {
    // Just ensure it renders without crashing
    render(<Chip error>Error Chip</Chip>);
    expect(screen.getByText('Error Chip')).toBeTruthy();
  });

  it('renders correctly without error prop', () => {
    render(<Chip error={false}>Normal Chip</Chip>);
    expect(screen.getByText('Normal Chip')).toBeTruthy();
  });
});
