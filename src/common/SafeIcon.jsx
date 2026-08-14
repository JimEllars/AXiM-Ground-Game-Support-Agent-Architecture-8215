
import React from 'react';
import * as Icons from 'react-icons/fi';
import { FiAlertCircle } from 'react-icons/fi';

const SafeIcon = ({ name, className = '', ...props }) => {
  // Try to map Lucide names to Feather names if necessary, or just prefix with Fi
  let iconName = name;
  if (!iconName.startsWith('Fi')) {
    iconName = 'Fi' + name;
  }

  const IconComponent = Icons[iconName] || Icons[`Fi${name}`];

  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in react-icons/fi, falling back to FiAlertCircle`);
    return <FiAlertCircle className={className} {...props} />;
  }

  return <IconComponent className={className} {...props} />;
};

export default SafeIcon;
