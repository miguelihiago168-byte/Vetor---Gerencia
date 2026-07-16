import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from './ui/Button';

export const getCockpitReturnContext = (location) => location?.state?.cockpitReturn || null;

export const forwardCockpitNavigationState = (location, state = {}) => {
  const cockpitReturn = getCockpitReturnContext(location);
  return cockpitReturn ? { ...state, cockpitReturn } : state;
};

function CockpitReturnButton({
  fallbackTo,
  fallbackLabel = 'Voltar',
  className = '',
  iconOnly = false,
  tone = 'neutral',
  variant = 'outline',
  ...buttonProps
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const cockpitReturn = getCockpitReturnContext(location);
  const target = cockpitReturn?.to || fallbackTo;
  const label = cockpitReturn ? 'Voltar ao Cockpit' : fallbackLabel;

  return (
    <Button
      tone={tone}
      variant={variant}
      className={className}
      onClick={() => navigate(target)}
      aria-label={label}
      title={label}
      startIcon={ArrowLeft}
      iconOnly={iconOnly}
      {...buttonProps}
    >
      {label}
    </Button>
  );
}

export default CockpitReturnButton;
