import { Box, Scissors, Layers, Tag } from 'lucide-react';
import type { StockCategoryType } from '../../types';

// Classification badge styling and definitions
export const CATEGORY_TYPE_META: Record<StockCategoryType, { 
  label: string; 
  badgeLabel: string; 
  badgeClass: string; 
  badgeExpandedClass: string;
  icon: any; 
}> = {
  finished: {
    label: 'Mamül (Bitmiş Ürün)',
    badgeLabel: 'MAMÜL',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/90',
    badgeExpandedClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    icon: Box
  },
  semi_finished: {
    label: 'Yarı Mamül',
    badgeLabel: 'YARI MAMÜL',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/90',
    badgeExpandedClass: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: Scissors
  },
  raw_material: {
    label: 'Hammadde',
    badgeLabel: 'HAMMADDE',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
    badgeExpandedClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: Layers
  },
  accessory: {
    label: 'Aksesuar / Malzeme',
    badgeLabel: 'AKSESUAR',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200/90',
    badgeExpandedClass: 'bg-purple-100 text-purple-900 border-purple-300',
    icon: Tag
  }
};
