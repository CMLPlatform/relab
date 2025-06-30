export interface Category {
  id: number;
  name: string;
  description?: string;
}

export interface ProductImage {
  id: number;
  filename: string;
  url: string;
  alt_text?: string;
  is_primary: boolean;
  created_at: string;
}

export interface ProductComponent {
  id: number;
  component_id: number;
  quantity: number;
  notes?: string;
  component: Product; // Recursive reference
}

export interface DisassemblySession {
  id: number;
  product_id: number;
  status: 'active' | 'completed' | 'paused';
  started_at: string;
  completed_at?: string;
  notes?: string;
}

export interface Product {
  id: number;
  name: string;
  brand?: string;
  model?: string;
  description?: string;

  // Relationships
  categories: Category[];
  images: ProductImage[];
  components: ProductComponent[];
  disassembly_sessions: DisassemblySession[];

  // Metadata
  created_at: string;
  updated_at: string;
  created_by?: number;

  // Computed fields (if your backend includes them)
  total_components?: number;
  primary_image?: ProductImage;
}

// For creation/updates - partial types
export interface CreateProductRequest {
  name: string;
  brand?: string;
  model?: string;
  description?: string;
  category_ids?: number[];
}

export interface UpdateProductRequest extends Partial<CreateProductRequest> {
  id: number;
}

// For component operations
export interface AddComponentRequest {
  component_id: number;
  quantity: number;
  notes?: string;
}

export interface CreateComponentRequest {
  name: string;
  brand?: string;
  model?: string;
  description?: string;
  quantity: number;
  parent_product_id: number;
}
