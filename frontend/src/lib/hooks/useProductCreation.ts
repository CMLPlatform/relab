import { create } from 'zustand';
import { Product } from '@/lib/types/product';

interface ProductCreationState {
  productData: Partial<Product>;
  updateProductData: (data: Partial<Product>) => void;
  submitProduct: () => Promise<Product>;
  resetProduct: () => void;
}

export const useProductCreationStore = create<ProductCreationState>((set, get) => ({
  productData: {},

  updateProductData: (data) =>
    set((state) => ({
      productData: { ...state.productData, ...data },
    })),

  submitProduct: async () => {
    const { productData } = get();
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    });
    return response.json();
  },

  resetProduct: () => set({ productData: {} }),
}));

export const useProductCreation = () => useProductCreationStore();
