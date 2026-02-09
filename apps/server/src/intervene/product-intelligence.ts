/**
 * Product Intelligence stub — will eventually integrate vector search
 * for finding alternative/complementary products.
 */

export interface ProductSuggestion {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  url: string;
  reason: string;
}

/**
 * Find alternative products for a given friction context.
 * Currently returns empty — will integrate vector search.
 */
export async function findAlternatives(
  _frictionId: string,
  _context: Record<string, unknown>
): Promise<ProductSuggestion[]> {
  // TODO: Implement vector search for product alternatives
  // This will query a product catalog using embedding similarity
  return [];
}

/**
 * Find complementary products for upselling.
 */
export async function findComplementary(
  _productId: string,
  _context: Record<string, unknown>
): Promise<ProductSuggestion[]> {
  // TODO: Implement complementary product search
  return [];
}
