import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'confident' | 'directional' | 'insufficient';
}

const badgeVariants = {
  base: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  variants: {
    default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
    secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
    outline: 'text-foreground',
    confident: 'border-transparent bg-green-600 text-white',
    directional: 'border-transparent bg-amber-500 text-black',
    insufficient: 'border-transparent bg-red-500 text-white',
  },
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants.base, badgeVariants.variants[variant], className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
