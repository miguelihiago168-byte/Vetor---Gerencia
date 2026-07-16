import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const getCockpitReturnContext = (location) => location?.state?.cockpitReturn || null;

export const forwardCockpitNavigationState = (location, state = {}) => {
  const cockpitReturn = getCockpitReturnContext(location);
  return cockpitReturn ? { ...state, cockpitReturn } : state;
};

function CockpitReturnButton({ fallbackTo, fallbackLabel = 'Voltar', className = 'btn btn-secondary', iconOnly = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const cockpitReturn = getCockpitReturnContext(location);
  const target = cockpitReturn?.to || fallbackTo;
  const label = cockpitReturn ? 'Voltar ao Cockpit' : fallbackLabel;

  return (
    <button
      type="button"
      className={className}
      onClick={() => navigate(target)}
      aria-label={label}
      title={label}
    >
      <ArrowLeft size={16} />
      {!iconOnly && label}
    </button>
  );
}

export default CockpitReturnButton;
