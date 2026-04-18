import useAuthStore from '@/store/authStore';
import useConfigStore from '@/store/configStore';

export function useTerms() {
  const company = useAuthStore((s) => s.company);
  const terminology = useConfigStore((s) => s.terminology) || {};
  const singular = terminology.item || company?.item_terminology || 'Product';
  const plural = terminology.items || company?.item_terminology_plural || `${singular}s`;
  const itemCode = terminology.item_code || 'SKU / Item Code';

  return {
    item: singular,
    items: plural,
    Item: singular,
    Items: plural,
    addItem: `Add ${singular}`,
    noItems: `No ${plural.toLowerCase()} found`,
    itemCode,
    itemCode2: terminology.item_code2 || null,
    supplier: terminology.supplier || 'Supplier',
    transfer: terminology.transfer || 'Stock Transfer',
  };
}

export default useTerms;
