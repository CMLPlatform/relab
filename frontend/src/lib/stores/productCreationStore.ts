// lib/stores/productCreationStore.ts (Simplified Version)
import { create } from 'zustand';

export interface MaterialEntry {
  material: {
    id: number;
    name: string;
    type: string;
  };
  percentage: string;
  mass: string;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'document';
  name: string;
  description: string;
}

export interface ProductFormData {
  // Basic info
  name: string;
  brand: string;
  model: string;
  description: string;
  product_type: string;

  // Physical properties
  weight: string;
  length: string;
  width: string;
  height: string;

  // Materials and media
  materials: MaterialEntry[];
  media: MediaItem[];

  // Meta
  isDraft: boolean;
  lastUpdated: string;
}

interface ProductCreationStore {
  formData: ProductFormData;
  updateBasicInfo: (data: Partial<ProductFormData>) => void;
  addMaterial: (material: MaterialEntry) => void;
  removeMaterial: (index: number) => void;
  addMediaItem: (item: MediaItem) => void;
  removeMediaItem: (id: string) => void;
  saveAsDraft: () => void;
  resetForm: () => void;
  getTotalMaterialsPercentage: () => number;
  isFormValid: () => boolean;
  hasDraft: () => boolean;
  resumeDraft: () => void;
}

const initialFormData: ProductFormData = {
  name: '',
  brand: '',
  model: '',
  description: '',
  product_type: '',
  weight: '',
  length: '',
  width: '',
  height: '',
  materials: [],
  media: [],
  isDraft: false,
  lastUpdated: '',
};

export const useProductCreationStore = create<ProductCreationStore>((set, get) => ({
  formData: initialFormData,

  updateBasicInfo: (data) =>
    set((state) => ({
      formData: {
        ...state.formData,
        ...data,
        lastUpdated: new Date().toISOString(),
      },
    })),

  addMaterial: (material) =>
    set((state) => ({
      formData: {
        ...state.formData,
        materials: [...state.formData.materials, material],
        lastUpdated: new Date().toISOString(),
      },
    })),

  removeMaterial: (index) =>
    set((state) => ({
      formData: {
        ...state.formData,
        materials: state.formData.materials.filter((_, i) => i !== index),
        lastUpdated: new Date().toISOString(),
      },
    })),

  addMediaItem: (item) =>
    set((state) => ({
      formData: {
        ...state.formData,
        media: [...state.formData.media, item],
        lastUpdated: new Date().toISOString(),
      },
    })),

  removeMediaItem: (id) =>
    set((state) => ({
      formData: {
        ...state.formData,
        media: state.formData.media.filter((item) => item.id !== id),
        lastUpdated: new Date().toISOString(),
      },
    })),

  saveAsDraft: () =>
    set((state) => ({
      formData: {
        ...state.formData,
        isDraft: true,
        lastUpdated: new Date().toISOString(),
      },
    })),

  resetForm: () => set({ formData: initialFormData }),

  getTotalMaterialsPercentage: () => {
    const { materials } = get().formData;
    return materials.reduce((sum, item) => sum + parseFloat(item.percentage || '0'), 0);
  },

  isFormValid: () => {
    const { name } = get().formData;
    return name.trim().length > 0;
  },

  hasDraft: () => {
    const { formData } = get();
    return (
      formData.isDraft &&
      (formData.name.trim().length > 0 || formData.materials.length > 0 || formData.media.length > 0)
    );
  },

  resumeDraft: () => {
    // Just a placeholder - the form data is already there
    return;
  },
}));
