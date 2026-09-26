export function applyCoupon(cart, coupon) {
  if (!coupon) return cart.total;
  return Math.max(0, cart.total - coupon.amount);
}
