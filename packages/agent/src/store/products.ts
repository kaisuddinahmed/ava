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
    category: 'clothing' | 'footwear' | 'watches' | 'accessories' | 'lifestyle';
    price: number;
    image: string;
    specs: string[];
    reviews: Review[];
    description: string;
    isDemo?: boolean; // For our specific scenarios
    stock?: number;
    colors?: string[]; // B#41
    sizes?: string[]; // B#41
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
            { id: 'r2', user: 'Sarah K.', rating: 4, text: 'Fits perfectly, very chic.', date: '2023-12-10' },
            { id: 'r3', user: 'Mike D.', rating: 5, text: 'Bought for my wife, she loves it.', date: '2024-02-01' },
            { id: 'r4', user: 'Traveler99', rating: 4, text: 'Great for rainy London days.', date: '2023-11-20' },
            { id: 'r5', user: 'StyleFan', rating: 5, text: 'The quality matches the price tag.', date: '2024-01-05' }
        ],
        description: "Embrace timeless elegance with our Classic Trench Coat, a staple for every sophisticated wardrobe. Meticulously crafted from high-grade waterproof cotton, this coat ensures you stay dry and stylish regardless of the weather. The double-breasted silhouette features a traditional storm flap, shoulder epaulettes, and a removable belt that cinches the waist for a flattering fit. Whether draped over evening wear or paired with casual denim, its versatile beige hue and premium tailoring make it the ultimate trans-seasonal outer layer. Designed for longevity, this piece resists wrinkles and retains its structure wear after wear.",
        isDemo: true,
        colors: ['Beige', 'Black', 'Navy'],
        sizes: ['XS', 'S', 'M', 'L', 'XL']
    },
    {
        id: 'summer-dress',
        name: 'Floral Summer Dress',
        category: 'clothing',
        price: 89.00,
        image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?q=80&w=500', // Model in dress
        specs: ['100% Silk', 'Floral Print', 'Midi Length'],
        reviews: [
            { id: 'r3', user: 'Anna P.', rating: 5, text: 'Perfect for garden parties!', date: '2024-02-01' },
            { id: 'r4', user: 'FlowerChild', rating: 5, text: 'Beautiful print, very vibrant.', date: '2024-01-12' },
            { id: 'r5', user: 'SummerLover', rating: 4, text: 'Light and airy, perfect for heat.', date: '2023-08-15' },
            { id: 'r6', user: 'Jenny W.', rating: 5, text: 'Fits true to size.', date: '2023-09-01' },
            { id: 'r7', user: 'Kate M.', rating: 4, text: 'Love the pockets!', date: '2023-07-20' }
        ],
        description: "Capture the essence of sun-drenched days with our Floral Summer Dress. Spun from 100% pure silk, this dress offers a breathable, feather-light feel against the skin, perfect for the warmest of days. The vibrant artisan-designed floral print features a kaleidoscope of summer blooms that guaranteed to turn heads at garden parties or beachside brunches. Its midi-length cut allows for effortless movement, while the subtle sweetheart neckline adds a touch of romantic charm. Complete with discrete side pockets and a concealed zipper, it marries functionality with high-end fashion aesthetics.",
        isDemo: true,
        stock: 3, // Urgency Trigger
        colors: ['Multi', 'Pink', 'Yellow'],
        sizes: ['S', 'M', 'L']
    },
    {
        id: 'urban-sneakers',
        name: 'Urban Street Sneakers',
        category: 'footwear',
        price: 110.00,
        image: 'https://images.unsplash.com/photo-1607792246307-2c7ba687b50a?q=80&w=500', // Sneakers
        specs: ['Breathable Mesh', 'Memory Foam', 'High-Grip Sole'],
        reviews: [
            { id: 'r4', user: 'Runner88', rating: 5, text: 'Super comfortable for all-day walking.', date: '2024-01-20' },
            { id: 'r5', user: 'StreetStyle', rating: 5, text: 'They look even better in person.', date: '2024-02-10' },
            { id: 'r6', user: 'GymRat', rating: 4, text: 'Good support for light runs.', date: '2023-12-05' },
            { id: 'r7', user: 'SneakerHead', rating: 5, text: 'Must cop. Very clean design.', date: '2024-01-01' },
            { id: 'r8', user: 'DailyWalker', rating: 5, text: 'My go-to shoes now.', date: '2023-11-15' }
        ],
        description: "Dominate the city streets with our Urban Street Sneakers, engineered for the modern mover. The upper is constructed from an advanced breathable mesh that facilitates maximum airflow, keeping your feet cool during intense activity or long commutes. Inside, a cloud-like memory foam insole molds to your foot's unique contours, providing bespoke support and shock absorption with every step. The rugged, high-grip rubber outsole ensures rock-solid traction on wet pavements and uneven terrain alike. With a sleek, aerodynamic profile and reflective accents for night visibility, these sneakers are the perfect fusion of athletic performance and streetwear style.",
        isDemo: true,
        colors: ['Black', 'White', 'Red'],
        sizes: ['US 7', 'US 8', 'US 9', 'US 10', 'US 11']
    },
    {
        id: 'silver-watch',
        name: 'Minimalist Silver Watch',
        category: 'watches',
        price: 249.00,
        image: 'https://images.unsplash.com/photo-1461141346587-763ab02bced9?q=80&w=500', // Watch
        specs: ['Stainless Steel', 'Sapherie Glass', '5ATM Water Resistant'],
        reviews: [
            { id: 'r1', user: 'TimeKeeper', rating: 5, text: 'Elegant and simple.', date: '2023-10-10' },
            { id: 'r2', user: 'BizPro', rating: 4, text: 'Looks professional for meetings.', date: '2023-11-01' },
            { id: 'r3', user: 'GiftGiver', rating: 5, text: 'He loved it!', date: '2023-12-25' },
            { id: 'r4', user: 'WatchCollector', rating: 4, text: 'Good movement for the price.', date: '2024-01-15' },
            { id: 'r5', user: 'Minimalist', rating: 5, text: 'Exactly what I was looking for.', date: '2024-02-05' }
        ],
        description: "A masterclass in understated luxury, the Minimalist Silver Watch is designed for those who value precision and style. The casing is forged from surgical-grade 316L stainless steel, polished to a mirror finish that catches the light beautifully. Its face, protected by scratch-resistant sapphire crystal glass, features clean indices and slender hands for immediate readability. Powered by a reliable Japanese quartz movement, it ensures you never miss a beat. With 5ATM water resistance, it withstands splashes and brief immersion, making it practical for daily wear. The adjustable link bracelet provides a secure, custom fit for any wrist size.",
        isDemo: true,
        colors: ['Silver', 'Gold'],
        sizes: ['One Size']
    },
    {
        id: 'chic-shades',
        name: 'Designer Aviator Shades',
        category: 'accessories',
        price: 159.00,
        image: 'https://images.unsplash.com/photo-1662091131946-338d213f4a39?q=80&w=500', // Sunglasses
        specs: ['Polarized Lens', 'Gold Frame', 'UV400 Protection'],
        reviews: [
            { id: 'r5', user: 'SunLover', rating: 5, text: 'Look expensive and feel great.', date: '2023-11-05' },
            { id: 'r6', user: 'BeachBum', rating: 5, text: 'Great sun protection.', date: '2023-08-20' },
            { id: 'r7', user: 'CitySlicker', rating: 4, text: 'Stylish but slightly loose.', date: '2023-09-10' },
            { id: 'r8', user: 'FashionForward', rating: 5, text: 'Trending style right now.', date: '2024-01-30' },
            { id: 'r9', user: 'DriverDave', rating: 5, text: 'Really helps with glare.', date: '2023-12-12' }
        ],
        description: "Elevate your look instantly with our Designer Aviator Shades, the quintessential accessory for the bold. These sunglasses feature high-definition polarized lenses that eliminate glare and provide crystal-clear vision, all while offering full UV400 protection against harmful rays. The iconic pilot shape is reimagined with a lightweight, gold-tone metal frame that sits comfortably on the face without heaviness. Adjustable silicone nose pads ensure a non-slip fit, even on the hottest days. Each pair comes with a premium hard case and a microfiber cleaning cloth, ensuring your shades stay pristine whether you're driving, beach-bound, or exploring the city.",
        isDemo: true,
        colors: ['Gold', 'Black'],
        sizes: ['One Size']
    },
    {
        id: 'leather-bag',
        name: 'Vintage Leather Satchel',
        category: 'accessories',
        price: 199.00,
        image: 'https://images.unsplash.com/photo-1663585703603-9be01a72a62a?q=80&w=500', // Bag? Or similar
        specs: ['Genuine Leather', 'Brass Hardware', 'Laptop Compartment'],
        reviews: [
            { id: 'r1', user: 'StudentLife', rating: 5, text: 'Fits my laptop perfectly.', date: '2023-09-01' },
            { id: 'r2', user: 'VintageSoul', rating: 5, text: 'Love the distressed look.', date: '2023-10-15' },
            { id: 'r3', user: 'Commuter', rating: 4, text: 'Strap could be more padded.', date: '2023-11-20' },
            { id: 'r4', user: 'BagLover', rating: 5, text: 'Smells like real leather!', date: '2024-01-05' },
            { id: 'r5', user: 'ProOrganizer', rating: 5, text: 'Lots of useful pockets.', date: '2024-02-10' }
        ],
        description: "Carry your essentials in style with this ruggedly handsome Vintage Leather Satchel. Handcrafted from full-grain vegetable-tanned leather, it develops a unique, rich patina over time, telling the story of your journeys. The heavy-duty antique brass hardware adds a touch of old-world charm and durability. Inside, you'll find a dedicated padded compartment large enough for a 15-inch laptop, alongside multiple organizers for pens, phones, and notebooks. The adjustable shoulder strap is reinforced for comfort during heavy loads, and the sturdy top handle offers a quick grab-and-go option. Ideally suitable for students, professionals, and digital nomads alike.",
        isDemo: true,
        colors: ['Brown', 'Tan', 'Black'],
        sizes: ['One Size']
    },
    {
        id: 'boots-leather',
        name: 'Classic Chelsea Boots',
        category: 'footwear',
        price: 180.00,
        image: 'https://images.unsplash.com/photo-1607792246387-4765c382c5a7?q=80&w=500', // Boots/Shoes
        specs: ['Genuine Leather', 'Elastic Side', 'Non-slip Sole'],
        reviews: [
            { id: 'r6', user: 'BootFan', rating: 5, text: 'Break in easily and look distinct.', date: '2024-02-14' },
            { id: 'r7', user: 'WinterWalker', rating: 5, text: 'Warm and waterproof.', date: '2023-12-01' },
            { id: 'r8', user: 'StylishDad', rating: 4, text: 'Good quality leather.', date: '2023-11-15' },
            { id: 'r9', user: 'ConcertGoer', rating: 5, text: 'Comfortable for standing all night.', date: '2023-10-20' },
            { id: 'r10', user: 'UrbanHiker', rating: 4, text: 'Soles have good grip.', date: '2024-01-10' }
        ],
        description: "Step out with confidence in our Classic Chelsea Boots, where heritage design meets modern comfort. Constructed from premium full-grain leather, these boots offer robust weather protection while molding comfortably to your feet over time. The signature elastic side panels and rear pull-tab make slipping them on and off effortless. Underneath, a durable rubber outsole features a specialized non-slip tread pattern, providing stability on slick city streets. The sleek, minimal toe profile ensures these boots look just as good with tailored suit trousers as they do with cuffed raw denim. A versatile footwear investment that transcends seasons.",
        isDemo: true,
        colors: ['Black', 'Brown'],
        sizes: ['US 7', 'US 8', 'US 9', 'US 10', 'US 11']
    },
    {
        id: 'smart-ring-fashion',
        name: 'Luxury Smart Ring',
        category: 'accessories',
        price: 299.00,
        image: 'https://images.unsplash.com/photo-1671960610018-f2fdebbe5b47?q=80&w=500',
        specs: ['Sleep Tracking', 'Gold Finish', '7 Days Battery'],
        reviews: [
            { id: 'r1', user: 'TechGeek', rating: 5, text: 'Tracking is very accurate.', date: '2024-01-25' },
            { id: 'r2', user: 'SleepyHead', rating: 5, text: 'Helped me improve my sleep.', date: '2024-02-05' },
            { id: 'r3', user: 'FashionTech', rating: 4, text: 'Looks like jewelry, acts like a tracker.', date: '2023-12-15' },
            { id: 'r4', user: 'BatteryLife', rating: 5, text: 'Battery actually lasts a week.', date: '2024-01-10' },
            { id: 'r5', user: 'EarlyAdopter', rating: 4, text: 'App is easy to use.', date: '2023-11-30' }
        ],
        description: "Experience the future of wearable technology discreetly with our Luxury Smart Ring. Disguised as a piece of fine jewelry with a stunning 18k gold finish, this device houses powerful sensors that monitor your sleep stages, heart rate, and activity levels 24/7. It connects seamlessly to your smartphone via Bluetooth, providing detailed health insights without the distraction of screens or notifications. The hypoallergenic titanium inner shell ensures comfort for all-day wear. With an impressive 7-day battery life and water resistance up to 50 meters, it's designed to live with you, not just on you. Reclaim your health metrics without compromising your style.",
        isDemo: true,
        colors: ['Gold', 'Silver', 'Black'],
        sizes: ['6', '7', '8', '9', '10']
    }
];

// 2. Generators
const CATEGORIES = ['clothing', 'footwear', 'watches', 'accessories', 'lifestyle'] as const;

// Distinct images for GENERATED products
const CLOTHING_GEN_IMAGES = [
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?q=80&w=500', // White Cloths
    'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?q=80&w=500', // Sweater
    'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=500', // Fashion
    'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?q=80&w=500', // Chic
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=500', // Trench (Reuse)
    'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?q=80&w=500'  // Dress (Reuse)
];

const FOOTWEAR_GEN_IMAGES = [
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=500', // Red Nike
    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=500', // Nike Air
    'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?q=80&w=500', // Red Shoes
    'https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=500', // Black Nike
    'https://images.unsplash.com/photo-1543508282-6319a3e2621f?q=80&w=500', // Boots
    'https://images.unsplash.com/photo-1562183241-b937e95585b6?q=80&w=500', // Running
    'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=500', // Casual
    'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?q=80&w=500', // Blue
    'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?q=80&w=500', // White
    'https://images.unsplash.com/photo-1515955656352-a1fa3ffcd111?q=80&w=500'  // Blue
];

const WATCH_GEN_IMAGES = [
    'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?q=80&w=500', // Gold/Silver
    'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?q=80&w=500', // Wristwatch
    'https://images.unsplash.com/photo-1542487354-feaf93476caa?q=80&w=500', // Close up
    'https://images.unsplash.com/photo-1526045431048-f857369baa09?q=80&w=500', // Product shot
    'https://images.unsplash.com/photo-1548171915-e79a380a2a4b?q=80&w=500', // Bronze
    'https://images.unsplash.com/photo-1461141346587-763ab02bced9?q=80&w=500', // Silver (Reuse)
    'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?q=80&w=500', // Duplicate Safe
    'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?q=80&w=500'  // Duplicate Safe
];

const ACCESSORY_GEN_IMAGES = [
    'https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=500', // Bag
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=500', // Jewelry
    'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?q=80&w=500', // Bag2
    'https://images.unsplash.com/photo-1576053139778-7e32f2ae3cfd?q=80&w=500', // Essentials
    'https://images.unsplash.com/photo-1620916297397-a4a5402a3c6c?q=80&w=500', // Pink purse
    'https://images.unsplash.com/photo-1662091131946-338d213f4a39?q=80&w=500', // Shades (Reuse)
    'https://images.unsplash.com/photo-1663585703603-9be01a72a62a?q=80&w=500'  // Satchel (Reuse)
];

const LIFESTYLE_GEN_IMAGES = [
  "https://images.unsplash.com/photo-1611930021698-a55ec4d5fe6e?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1605714117967-9fe201ddfe9d?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1684721689327-9ff62a215161?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1656782047936-4ba73fac0fe4?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1766934587214-86e21b3ae093?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1599865240613-69a7655f94b3?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1684721689079-f3cb8b07381f?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1611930021592-a8cfd5319ceb?q=80&w=600&auto=format&fit=crop"
];

const CATEGORY_IMAGES = {
    clothing: CLOTHING_GEN_IMAGES,
    footwear: FOOTWEAR_GEN_IMAGES,
    watches: WATCH_GEN_IMAGES,
    accessories: ACCESSORY_GEN_IMAGES,
    lifestyle: LIFESTYLE_GEN_IMAGES
};

// Keywords for dynamic naming
const ADJECTIVES = ['Elegant', 'Urban', 'Vintage', 'Modern', 'Luxe', 'Casual', 'Formal', 'Chic', 'Retro', 'Classic', 'Bold', 'Summer', 'Winter', 'Essential', 'Premium', 'Minimal', 'Sleek', 'Smart'];
const NOUNS = {
    clothing: ['Jacket', 'Coat', 'Dress', 'Shirt', 'Blouse', 'Tee', 'Hoodie', 'Blazer', 'Skirt', 'Trousers'],
    footwear: ['Sneakers', 'Boots', 'Loafers', 'Heels', 'Sandals', 'Flats', 'Oxfords', 'Trainers', 'Pumps', 'Slides'],
    watches: ['Chronograph', 'Timepiece', 'Dial', 'Quartz', 'Automatic', 'Classic', 'Sport', 'Diver', 'Pilot', 'Field'],
    accessories: ['Bag', 'Purse', 'Scarf', 'Belt', 'Hat', 'Cap', 'Wallet', 'Glasses', 'Necklace', 'Bracelet'],
    lifestyle: ['Planter', 'Lamp', 'Chair', 'Speaker', 'Vase', 'Diffuser', 'Clock', 'Organizer', 'Stand', 'Monitor']
};
const SUFFIXES = ['Collection', 'Edition', 'Series', 'Fit', 'Basic', 'Signature', 'Vibe', 'Mode', 'Style', 'Wear', 'Pro', 'Max', 'Lite'];

// Review Data
const REVIEWERS = ['Emma S.', 'Liam J.', 'FashionGuru', 'StyleIcon', 'Olivia W.', 'Noah B.', 'TrendSetter', 'DesignerDan', 'Chloe M.', 'Shopaholic', 'TechLover', 'HomeDecorFan'];
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



function generateDescription(cat: string, name: string): string {
    const intros = [
        "Experience the epitome of style and comfort with this exceptional piece.",
        "Redefine your everyday look with a product designed for the modern lifestyle.",
        "Crafted with precision and care, this item represents the pinnacle of our collection.",
        "Discover a new standard of quality with materials sourced from the finest suppliers.",
        "Elevate your wardrobe instantly with this versatile and striking addition."
    ];
    
    const middles = [
        `The ${name} functionality meets fashion in a way that feels effortless and tailored to your needs.`,
        "Every stitch and detail has been considered to ensure longevity and timeless appeal.",
        "It features a unique blend of textures that feel luxurious against the skin while remaining durable.",
        "Designed for those who appreciate the finer things, it offers unmatched versatility for any occasion.",
        "Whether you are heading to a formal event or a casual outing, this piece adapts to your environment."
    ];
    
    const outros = [
        "Don't just wear it—live in it. This is more than just a product; it's a statement.",
        "Upgrade your collection today and feel the difference of true craftsmanship.",
        "Limited availability ensures that your look remains as unique as you are.",
        "Join thousands of satisfied customers who have made this their go-to favorite.",
        "Make an impression that lasts with a design that never goes out of style."
    ];

    const intro = intros[Math.floor(Math.random() * intros.length)];
    const middle = middles[Math.floor(Math.random() * middles.length)];
    const outro = outros[Math.floor(Math.random() * outros.length)];
    
    // Add specifically filler text to ensure it triggers the line clamp
    const filler = "Furthermore, our commitment to sustainability means this product was created with eco-friendly practices in mind. We believe in fashion that looks good and does good. The ergonomic design ensures tailored fit and maximum comfort throughout the day, making it an essential companion for your busy lifestyle. Care instructions are simple, ensuring this piece remains a highlight of your closet for years to come.";

    return `${intro} ${middle} ${filler} ${outro}`;
}


function generateProducts(): Product[] {
    const products: Product[] = [...DEMO_PRODUCTS];
    let idCounter = 1;

    // Generators
    const POSSIBLE_COLORS = ['Black', 'White', 'Red', 'Blue', 'Green', 'Beige', 'Gold', 'Silver'];
    const POSSIBLE_SIZES = {
        clothing: ['XS', 'S', 'M', 'L', 'XL'],
        footwear: ['US 7', 'US 8', 'US 9', 'US 10', 'US 11'],
        watches: ['One Size'],
        accessories: ['One Size'],
        lifestyle: ['One Size']
    };

    CATEGORIES.forEach(cat => {
        const imageList = CATEGORY_IMAGES[cat];
        
        // Target: 8 items per category
        // We calculate how many exist in DEMO_PRODUCTS derived from this category
        const existingCount = products.filter(p => p.category === cat).length;
        const target = 8;
        const needed = Math.max(0, target - existingCount);

        for (let i = 0; i < needed; i++) {
            const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
            const noun = NOUNS[cat][Math.floor(Math.random() * NOUNS[cat].length)];
            const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
            const price = Math.floor(Math.random() * 450) + 30; // Price range adjusted for fashion

            // Generate Unique ID
            const uniqueId = `${cat}-${adj.toLowerCase()}-${noun.toLowerCase()}-${idCounter++}`;

            // Use Guaranteed Distinct Image
            // We cycle through them.
            const image = imageList[i % imageList.length];

            // Generate Random Reviews (Minimum 5)
            const reviews: Review[] = [];
            const reviewCount = Math.floor(Math.random() * 5) + 5; // 5 to 9 reviews
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
                description: generateDescription(cat, `${adj} ${noun} ${suffix}`),
                stock: 50,
                colors: [POSSIBLE_COLORS[Math.floor(Math.random() * POSSIBLE_COLORS.length)], POSSIBLE_COLORS[Math.floor(Math.random() * POSSIBLE_COLORS.length)]],
                sizes: POSSIBLE_SIZES[cat] || ['One Size']
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
