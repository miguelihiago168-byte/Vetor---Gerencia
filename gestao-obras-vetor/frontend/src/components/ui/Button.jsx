import React, { forwardRef } from 'react';
import { Loader } from 'lucide-react';
import './Button.css';

const renderIcon = (Icon, className) => {
  if (!Icon) return null;
  if (React.isValidElement(Icon)) {
    return React.cloneElement(Icon, {
      className: [className, Icon.props.className].filter(Boolean).join(' '),
      'aria-hidden': true
    });
  }
  return <Icon className={className} size={16} aria-hidden="true" />;
};

export const Button = forwardRef(function Button({
  as: Component = 'button',
  tone = 'neutral',
  variant = 'outline',
  size = 'md',
  startIcon,
  endIcon,
  loading = false,
  fullWidth = false,
  iconOnly = false,
  className = '',
  children,
  disabled = false,
  type,
  tabIndex,
  onClick,
  ...props
}, ref) {
  const isNativeButton = Component === 'button';
  const isDisabled = disabled || loading;
  const classes = [
    'ui-button',
    `ui-button--${tone}`,
    `ui-button--${variant}`,
    `ui-button--${size}`,
    fullWidth ? 'ui-button--full' : '',
    iconOnly ? 'ui-button--icon-only' : '',
    loading ? 'is-loading' : '',
    className
  ].filter(Boolean).join(' ');

  const handleClick = (event) => {
    if (isDisabled && !isNativeButton) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  return (
    <Component
      ref={ref}
      className={classes}
      {...props}
      {...(isNativeButton ? { type: type || 'button', disabled: isDisabled, tabIndex } : {
        'aria-disabled': isDisabled || undefined,
        tabIndex: isDisabled ? -1 : tabIndex
      })}
      aria-busy={loading || undefined}
      onClick={handleClick}
    >
      {loading ? <Loader className="ui-button__spinner" size={16} aria-hidden="true" /> : renderIcon(startIcon, 'ui-button__icon')}
      {!iconOnly && <span className="ui-button__label">{children}</span>}
      {!loading && renderIcon(endIcon, 'ui-button__icon')}
    </Component>
  );
});

export const IconButton = forwardRef(function IconButton({
  label,
  title,
  icon,
  size = 'md',
  ...props
}, ref) {
  const accessibleLabel = label || title;

  if (!accessibleLabel && import.meta.env?.DEV) {
    console.warn('IconButton requer a propriedade label ou title.');
  }

  return (
    <Button
      ref={ref}
      size={size}
      startIcon={icon}
      iconOnly
      aria-label={accessibleLabel || 'Ação'}
      title={title || accessibleLabel}
      {...props}
    />
  );
});

export default Button;
