export interface DistributionResult {
  allocated: Map<string, number>;
  unmet: Map<string, number>;
  surplus: number;
}

export function distributeEqually(
  available: number,
  demands: Map<string, number>,
  epsilon: number
): DistributionResult {
  const allocated = new Map<string, number>();
  const remaining = new Map(demands);
  let remainingAvailable = available;

  while (remainingAvailable > epsilon && remaining.size > 0) {
    const share = remainingAvailable / remaining.size;
    let distributed = 0;

    for (const [id, demand] of remaining) {
      const amount = Math.min(share, demand);
      allocated.set(id, (allocated.get(id) ?? 0) + amount);
      remaining.set(id, demand - amount);
      distributed += amount;
    }

    remainingAvailable -= distributed;

    for (const [id, demand] of remaining) {
      if (demand <= epsilon) {
        remaining.delete(id);
      }
    }

    if (distributed <= epsilon) {
      break;
    }
  }

  return {
    allocated,
    unmet: remaining,
    surplus: remainingAvailable
  };
}
