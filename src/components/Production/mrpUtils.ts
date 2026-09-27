export const getMrpKey = (item: { rawMaterialId: number; color?: string }) => `${item.rawMaterialId}__${item.color || 'all'}`;
