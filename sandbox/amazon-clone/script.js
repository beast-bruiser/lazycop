/* ─── Product Data ─────────────────────────────────────────── */
const PRODUCTS = [
  {
    id: 1,
    title: "Wireless Noise-Cancelling Headphones",
    price: 79.99,
    rating: 4.5,
    reviews: 2341,
    img: "https://placehold.co/300x300/e8e8e8/555?text=Headphones",
    category: "Electronics",
  },
  {
    id: 2,
    title: "Mechanical Keyboard — Compact TKL",
    price: 54.95,
    rating: 4.3,
    reviews: 887,
    img: "https://placehold.co/300x300/e8e8e8/555?text=Keyboard",
    category: "Electronics",
  },
  {
    id: 3,
    title: "Ergonomic Office Chair",
    price: 249.00,
    rating: 4.7,
    reviews: 1120,
    img: "https://placehold.co/300x300/e8e8e8/555?text=Chair",
    category: "Furniture",
  },
  {
    id: 4,
    title: "Stainless Steel Water Bottle 32oz",
    price: 19.99,
    rating: 4.6,
    reviews: 5432,
    img: "https://placehold.co/300x300/e8e8e8/555?text=Bottle",
    category: "Kitchen",
  },
  {
    id: 5,
    title: "Yoga Mat — Non-Slip 6mm",
    price: 29.95,
    rating: 4.4,
    reviews: 3100,
    img: "https://placehold.co/300x300/e8e8e8/555?text=Yoga+Mat",
    category: "Sports",
  },
  {
    id: 6,
    title: "USB-C Hub 7-in-1",
    price: 34.99,
    rating: 4.2,
    reviews: 642,
    img: "https://placehold.co/300x300/e8e8e8/555?text=USB+Hub",
    category: "Electronics",
  },
  {
    id: 7,
    title: "LED Desk Lamp with Wireless Charging",
    price: 44.99,
    rating: 4.5,
    reviews: 980,
    img: "https://placehold.co/300x300/e8e8e8/555?text=Lamp",
    category: "Home",
  },
  {
    id: 8,
    title: "Running Shoes — Lightweight Mesh",
    price: 69.99,
    rating: 4.3,
    reviews: 2210,
    img: "https://placehold.co/300x300/e8e8e8/555?text=Shoes",
    category: "Sports",
  },
];

/* ─── Cart State ───────────────────────────────────────────── */
// cart: Map<productId, { product, qty }>
const cart = new Map();

/* ─── DOM References ───────────────────────────────────────── */
const grid        = document.getElementById("product-grid");
const cartIcon    = document.getElementById("cart-icon");
const cartDrawer  = document.getElementById("cart-drawer");
const overlay     = document.getElementById("overlay");
const closeCart   = document.getElementById("close-cart");
const cartItems   = document.getElementById("cart-items");
const cartTotal   = document.getElementById("cart-total");
const cartCount   = document.getElementById("cart-count");
const searchInput = document.getElementById("search-input");
const searchBtn   = document.getElementById("search-btn");
const checkoutBtn = document.getElementById("checkout-btn");

/* ─── Render Products ──────────────────────────────────────── */
function renderProducts(list) {
  grid.innerHTML = "";
  if (list.length === 0) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#888;">No products found.</p>';
    return;
  }
  list.forEach((p) => {
    const stars = starsHTML(p.rating);
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <img class="card__img" src="${p.img}" alt="${p.title}" loading="lazy" />
      <p class="card__title">${p.title}</p>
      <div class="card__rating">${stars} <small style="color:#555">(${p.reviews.toLocaleString()})</small></div>
      <p class="card__price">$${p.price.toFixed(2)}</p>
      <button class="card__btn" data-id="${p.id}">Add to Cart</button>
    `;
    grid.appendChild(card);
  });
}

function starsHTML(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

/* ─── Search ───────────────────────────────────────────────── */
function doSearch() {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = PRODUCTS.filter(
    (p) => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  );
  renderProducts(filtered);
}

searchBtn.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

/* ─── Add to Cart ──────────────────────────────────────────── */
grid.addEventListener("click", (e) => {
  const btn = e.target.closest(".card__btn");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const product = PRODUCTS.find((p) => p.id === id);
  if (!product) return;

  if (cart.has(id)) {
    cart.get(id).qty += 1;
  } else {
    cart.set(id, { product, qty: 1 });
  }
  updateCartUI();
  showToast(`"${product.title.slice(0, 30)}…" added to cart`);
});

/* ─── Cart Drawer Toggle ───────────────────────────────────── */
function openCart()  { cartDrawer.classList.add("open"); overlay.classList.add("open"); }
function closeCartFn() { cartDrawer.classList.remove("open"); overlay.classList.remove("open"); }

cartIcon.addEventListener("click", openCart);
closeCart.addEventListener("click", closeCartFn);
overlay.addEventListener("click", closeCartFn);

/* ─── Update Cart UI ───────────────────────────────────────── */
function updateCartUI() {
  // badge
  const totalQty = [...cart.values()].reduce((s, i) => s + i.qty, 0);
  cartCount.textContent = totalQty;

  // items list
  if (cart.size === 0) {
    cartItems.innerHTML = '<li class="empty-cart">Your cart is empty 🛒</li>';
    cartTotal.textContent = "$0.00";
    return;
  }

  cartItems.innerHTML = "";
  let total = 0;

  cart.forEach(({ product, qty }, id) => {
    total += product.price * qty;
    const li = document.createElement("li");
    li.className = "cart-item";
    li.innerHTML = `
      <img src="${product.img}" alt="${product.title}" />
      <div class="cart-item__info">
        <p class="cart-item__name">${product.title}</p>
        <p class="cart-item__price">$${(product.price * qty).toFixed(2)}</p>
        <div class="cart-item__qty">
          <button data-action="dec" data-id="${id}">−</button>
          <span>${qty}</span>
          <button data-action="inc" data-id="${id}">+</button>
        </div>
      </div>
    `;
    cartItems.appendChild(li);
  });

  cartTotal.textContent = `$${total.toFixed(2)}`;
}

/* ─── Qty Buttons ──────────────────────────────────────────── */
cartItems.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;
  if (!cart.has(id)) return;

  if (action === "inc") {
    cart.get(id).qty += 1;
  } else {
    cart.get(id).qty -= 1;
    if (cart.get(id).qty <= 0) cart.delete(id);
  }
  updateCartUI();
});

/* ─── Checkout ─────────────────────────────────────────────── */
checkoutBtn.addEventListener("click", () => {
  if (cart.size === 0) return;
  cart.clear();
  updateCartUI();
  closeCartFn();
  showToast("Order placed! Thanks for shopping 🎉");
});

/* ─── Toast ────────────────────────────────────────────────── */
let toastTimer;
const toast = Object.assign(document.createElement("div"), { className: "toast" });
document.body.appendChild(toast);

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

/* ─── Init ─────────────────────────────────────────────────── */
renderProducts(PRODUCTS);
updateCartUI();
