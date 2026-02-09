export interface Review {
    id: string;
    user: string;
    rating: number; // 1-5
    text: string;
    date: string;
}

export interface Product {
    id: string;
    name: string;
    category: 'clothing' | 'footwear' | 'watches' | 'accessories';
    price: number;
    image: string;
    specs: string[];
    reviews: Review[];
    isDemo?: boolean; // For our specific scenarios
    stock?: number;
}

// 1. Critical Demo Items (Must exist for scripts to work)
const DEMO_PRODUCTS: Product[] = [
    {
        id: 'trench-coat',
        name: 'Classic Trench Coat',
        category: 'clothing',
        price: 129.00,
        image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=500', // Fashion Model
        specs: ['Waterproof Cotton', 'Double-breasted', 'Belted Waist'],
        reviews: [
            { id: 'r1', user: 'Fashionista', rating: 5, text: 'A timeless piece for any wardrobe.', date: '2024-01-15' },
            { id: 'r2', user: 'Sarah K.', rating: 4, text: 'Fits perfectly, very chic.', date: '2023-12-10' }
        ],
        isDemo: true
    },
    {
        id: 'summer-dress',
        name: 'Floral Summer Dress',
        category: 'clothing',
        price: 89.00,
        image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?q=80&w=500', // Model in dress
        specs: ['100% Silk', 'Floral Print', 'Midi Length'],
        reviews: [
            { id: 'r3', user: 'Anna P.', rating: 5, text: 'Perfect for garden parties!', date: '2024-02-01' }
        ],
        isDemo: true,
        stock: 3 // Urgency Trigger
    },
    {
        id: 'urban-sneakers',
        name: 'Urban Street Sneakers',
        category: 'footwear',
        price: 110.00,
        image: 'https://images.unsplash.com/photo-1607792246307-2c7ba687b50a?q=80&w=500', // Sneakers
        specs: ['Breathable Mesh', 'Memory Foam', 'High-Grip Sole'],
        reviews: [
            { id: 'r4', user: 'Runner88', rating: 5, text: 'Super comfortable for all-day walking.', date: '2024-01-20' }
        ],
        isDemo: true
    },
    {
        id: 'silver-watch',
        name: 'Minimalist Silver Watch',
        category: 'watches',
        price: 249.00,
        image: 'https://images.unsplash.com/photo-1461141346587-763ab02bced9?q=80&w=500', // Watch
        specs: ['Stainless Steel', 'Sapherie Glass', '5ATM Water Resistant'],
        reviews: [],
        isDemo: true
    },
    {
        id: 'chic-shades',
        name: 'Designer Aviator Shades',
        category: 'accessories',
        price: 159.00,
        image: 'https://images.unsplash.com/photo-1662091131946-338d213f4a39?q=80&w=500', // Sunglasses
        specs: ['Polarized Lens', 'Gold Frame', 'UV400 Protection'],
        reviews: [
            { id: 'r5', user: 'SunLover', rating: 5, text: 'Look expensive and feel great.', date: '2023-11-05' }
        ],
        isDemo: true
    },
    {
        id: 'leather-bag',
        name: 'Vintage Leather Satchel',
        category: 'accessories',
        price: 199.00,
        image: 'https://images.unsplash.com/photo-1663585703603-9be01a72a62a?q=80&w=500', // Bag? Or similar
        specs: ['Genuine Leather', 'Brass Hardware', 'Laptop Compartment'],
        reviews: [],
        isDemo: true
    },
    {
        id: 'boots-leather',
        name: 'Classic Chelsea Boots',
        category: 'footwear',
        price: 180.00,
        image: 'https://images.unsplash.com/photo-1607792246387-4765c382c5a7?q=80&w=500', // Boots/Shoes
        specs: ['Genuine Leather', 'Elastic Side', 'Non-slip Sole'],
        reviews: [
            { id: 'r6', user: 'BootFan', rating: 5, text: 'Break in easily and look distinct.', date: '2024-02-14' }
        ],
        isDemo: true
    },
    {
        id: 'smart-ring-fashion',
        name: 'Luxury Smart Ring',
        category: 'accessories',
        price: 299.00,
        image: 'https://images.unsplash.com/photo-1671960610018-f2fdebbe5b47?q=80&w=500',
        specs: ['Sleep Tracking', 'Gold Finish', '7 Days Battery'],
        reviews: [],
        isDemo: true
    }
];

// 2. Generators
const CATEGORIES = ['clothing', 'footwear', 'watches', 'accessories'] as const;

// Curated Reliable Static Images (Unsplash Harvested)
const CLOTHING_IMAGES = [
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=500',
    'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?q=80&w=500',
    'https://images.unsplash.com/photo-1541519481457-763224276691?q=80&w=500',
    'https://images.unsplash.com/photo-1562572159-4efc207f5aff?q=80&w=500'
];

const FOOTWEAR_IMAGES = [
    'https://images.unsplash.com/photo-1607792246307-2c7ba687b50a?q=80&w=500',
    'https://images.unsplash.com/photo-1607792246387-4765c382c5a7?q=80&w=500',
    'https://images.unsplash.com/photo-1607792246466-17b46ae157d6?q=80&w=500',
    'https://images.unsplash.com/photo-1607792246511-0b5f445700b4?q=80&w=500'
];

const WATCH_IMAGES = [
    'https://images.unsplash.com/photo-1461141346587-763ab02bced9?q=80&w=500',
    'https://images.unsplash.com/photo-1518639845127-064c4bd0c574?q=80&w=500',
    'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?q=80&w=500',
    'https://images.unsplash.com/photo-1524805444758-089113d48a6d?q=80&w=500'
];

const ACCESSORY_IMAGES = [
    'https://images.unsplash.com/photo-1662091131946-338d213f4a39?q=80&w=500',
    'https://images.unsplash.com/photo-1663585703603-9be01a72a62a?q=80&w=500',
    'https://images.unsplash.com/photo-1671464389911-dd0d8a06f2d3?q=80&w=500',
    'https://images.unsplash.com/photo-1671960610018-f2fdebbe5b47?q=80&w=500'
];

const CATEGORY_IMAGES = {
    clothing: CLOTHING_IMAGES,
    footwear: FOOTWEAR_IMAGES,
    watches: WATCH_IMAGES,
    accessories: ACCESSORY_IMAGES
};

// Keywords for dynamic naming
const ADJECTIVES = ['Elegant', 'Urban', 'Vintage', 'Modern', 'Luxe', 'Casual', 'Formal', 'Chic', 'Retro', 'Classic', 'Bold', 'Summer', 'Winter', 'Essential', 'Premium'];
const NOUNS = {
    clothing: ['Jacket', 'Coat', 'Dress', 'Shirt', 'Blouse', 'Tee', 'Hoodie', 'Blazer', 'Skirt', 'Trousers'],
    footwear: ['Sneakers', 'Boots', 'Loafers', 'Heels', 'Sandals', 'Flats', 'Oxfords', 'Trainers', 'Pumps', 'Slides'],
    watches: ['Chronograph', 'Timepiece', 'Dial', 'Quartz', 'Automatic', 'Classic', 'Sport', 'Diver', 'Pilot', 'Field'],
    accessories: ['Bag', 'Purse', 'Scarf', 'Belt', 'Hat', 'Cap', 'Wallet', 'Glasses', 'Necklace', 'Bracelet']
};
const SUFFIXES = ['Collection', 'Edition', 'Series', 'Fit', 'Basic', 'Signature', 'Vibe', 'Mode', 'Style', 'Wear'];

// Review Data
const REVIEWERS = ['Emma S.', 'Liam J.', 'FashionGuru', 'StyleIcon', 'Olivia W.', 'Noah B.', 'TrendSetter', 'DesignerDan', 'Chloe M.', 'Shopaholic'];
const COMMENTS = [
    { rating: 5, text: "The quality is outstanding. Fits exactly as described." },
    { rating: 5, text: "A beautiful addition to my collection. Stunning!" },
    { rating: 4, text: "Love the style, though shipping was a bit slow." },
    { rating: 4, text: "Comfortable and stylish. Highly recommended." },
    { rating: 3, text: "Fabric feels a bit thinner than expected, but looks good." },
    { rating: 5, text: "Absolute perfection. I get complements everywhere I go." },
    { rating: 2, text: "Size runs small. Had to return for a larger one." },
    { rating: 5, text: "Bought this as a gift and they absolutely loved it." },
    { rating: 4, text: "Great value for the price. Will buy again." },
    { rating: 3, text: "Color is slightly different from the picture." }
];

function generateReview(idPrefix: string, index: number): Review {
    const comment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
    const daysAgo = Math.floor(Math.random() * 300);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    return {
        id: `${idPrefix}-r${index}`,
        user: REVIEWERS[Math.floor(Math.random() * REVIEWERS.length)],
        rating: comment.rating,
        text: comment.text,
        date: date.toISOString().split('T')[0]
    };
}


function generateProducts(): Product[] {
    const products: Product[] = [...DEMO_PRODUCTS];
    let idCounter = 1;

    CATEGORIES.forEach(cat => {
        const imageList = CATEGORY_IMAGES[cat];

        for (let i = 0; i < 30; i++) {
            const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
            const noun = NOUNS[cat][Math.floor(Math.random() * NOUNS[cat].length)];
            const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
            const price = Math.floor(Math.random() * 450) + 30; // Price range adjusted for fashion

            // Generate Unique ID
            const uniqueId = `${cat}-${adj.toLowerCase()}-${noun.toLowerCase()}-${idCounter++}`;

            // Use Guaranteed Static Image (Cycling)
            const image = imageList[i % imageList.length];

            // Generate Random Reviews
            const reviews: Review[] = [];
            const reviewCount = Math.floor(Math.random() * 5); // 0 to 4 reviews
            for (let r = 0; r < reviewCount; r++) {
                reviews.push(generateReview(uniqueId, r));
            }

            products.push({
                id: uniqueId,
                name: `${adj} ${noun} ${suffix}`,
                category: cat,
                price: price,
                image: image,
                specs: ['Premium Material', 'Sustainable', 'New Season'],
                reviews: reviews,
                stock: 50
            });
        }
    });

    return products;
}

export const ALL_PRODUCTS = generateProducts();

export const getProductsByCategory = (cat: string) => ALL_PRODUCTS.filter(p => p.category === cat);
export const searchProducts = (query: string) => {
    const q = query.toLowerCase();
    return ALL_PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || p.category.includes(q));
};
