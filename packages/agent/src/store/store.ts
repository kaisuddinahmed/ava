import { Product, ALL_PRODUCTS } from './products';

// --- Types ---
export interface CartItem extends Product {
    quantity: number;
}

export interface UserProfile {
    name: string;
    balance: number;
    preferences: string[];
    hasIntervention?: boolean; // New: Tracks if AI helped this session
}

export interface StoreState {
    cart: CartItem[];
    user: UserProfile;
}

// --- Default State ---
const DEFAULT_USER: UserProfile = {
    name: 'Kais Uddin Ahmed',
    balance: 5200.00,
    preferences: ['audio', 'tech'],
    hasIntervention: false
};

// --- Storage Keys ---
const STORAGE = sessionStorage; // Performance Optimization: Use SessionStorage
const KEY_CART = 'techspace_cart';
const KEY_USER = 'techspace_user';

// --- Event Bus (Simple) ---
type Listener = () => void;
const listeners: Listener[] = [];
const notify = () => listeners.forEach(l => l());

// --- Actions ---

export const markIntervention = () => {
    const user = getUser();
    user.hasIntervention = true;
    STORAGE.setItem(KEY_USER, JSON.stringify(user));
    notify();
};

export const getCart = (): CartItem[] => {
    try {
        return JSON.parse(STORAGE.getItem(KEY_CART) || '[]');
    } catch { return []; }
};

export const getUser = (): UserProfile => {
    try {
        return JSON.parse(STORAGE.getItem(KEY_USER) || JSON.stringify(DEFAULT_USER));
    } catch { return DEFAULT_USER; }
};

export const addToCart = (productId: string) => {
    const cart = getCart();
    const existing = cart.find(i => i.id === productId);

    if (existing) {
        existing.quantity++;
    } else {
        const product = ALL_PRODUCTS.find(p => p.id === productId);
        if (product) {
            cart.push({ ...product, quantity: 1 });
        }
    }

    STORAGE.setItem(KEY_CART, JSON.stringify(cart));
    notify();
};

export const removeFromCart = (productId: string) => {
    let cart = getCart();
    const existing = cart.find(i => i.id === productId);

    if (existing) {
        if (existing.quantity > 1) {
            existing.quantity--;
        } else {
            cart = cart.filter(i => i.id !== productId);
        }
    }

    STORAGE.setItem(KEY_CART, JSON.stringify(cart));
    notify();
};

export const clearCart = () => {
    STORAGE.setItem(KEY_CART, '[]');
    notify();
};

export const getCartTotal = () => {
    return getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

export const getCartCount = () => {
    return getCart().reduce((sum, item) => sum + item.quantity, 0);
};

export const subscribe = (cb: Listener) => { // Changed 'fn' to 'cb' and type to Listener
    listeners.push(cb); // Changed 'add' to 'push' as listeners is an array
    return () => {
        const idx = listeners.indexOf(cb); // Changed 'fn' to 'cb'
        if (idx > -1) listeners.splice(idx, 1); // Corrected closing braces and logic for array
    };
};

// Initialize
if (!STORAGE.getItem(KEY_USER)) {
    STORAGE.setItem(KEY_USER, JSON.stringify(DEFAULT_USER));
}
