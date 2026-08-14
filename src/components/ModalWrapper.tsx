'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { ProductDetailModal } from '@/components/ProductDetailModal';

export const ModalWrapper: React.FC = () => {
  const { selectedProductForModal, closeProductModal } = useApp();

  return (
    <ProductDetailModal
      product={selectedProductForModal}
      onClose={closeProductModal}
    />
  );
};
