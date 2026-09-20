import type { Account, CashBox, BankAccount } from '../types';

export const INITIAL_TDHP_ACCOUNTS: Omit<Account, 'id'>[] = [
  // 1 DÖNEN VARLIKLAR
  { code: '1', name: 'DÖNEN VARLIKLAR', type: 'asset', level: 1, isSystem: true, isActive: true },
  { code: '10', name: 'HAZIR DEĞERLER', type: 'asset', level: 2, parentCode: '1', isSystem: true, isActive: true },
  { code: '100', name: 'KASA', type: 'asset', level: 3, parentCode: '10', isSystem: true, isActive: true },
  { code: '100.01', name: 'Merkez TL Kasası', type: 'asset', level: 4, parentCode: '100', currency: 'TRY', isSystem: true, isActive: true },
  { code: '100.02', name: 'Şube / Mağaza Kasası', type: 'asset', level: 4, parentCode: '100', currency: 'TRY', isSystem: false, isActive: true },
  { code: '100.03', name: 'Döviz Kasası (USD)', type: 'asset', level: 4, parentCode: '100', currency: 'USD', isSystem: false, isActive: true },
  { code: '100.04', name: 'Döviz Kasası (EUR)', type: 'asset', level: 4, parentCode: '100', currency: 'EUR', isSystem: false, isActive: true },
  
  { code: '101', name: 'ALINAN ÇEKLER', type: 'asset', level: 3, parentCode: '10', isSystem: true, isActive: true },
  { code: '101.01', name: 'Portföydeki Çekler', type: 'asset', level: 4, parentCode: '101', currency: 'TRY', isSystem: true, isActive: true },
  { code: '101.02', name: 'Tahsildeki Çekler (Bankada)', type: 'asset', level: 4, parentCode: '101', currency: 'TRY', isSystem: true, isActive: true },
  { code: '101.03', name: 'Teminattaki Çekler', type: 'asset', level: 4, parentCode: '101', currency: 'TRY', isSystem: false, isActive: true },

  { code: '102', name: 'BANKALAR', type: 'asset', level: 3, parentCode: '10', isSystem: true, isActive: true },
  { code: '102.01', name: 'Garanti BBVA Vadesiz TL Hesabı', type: 'asset', level: 4, parentCode: '102', currency: 'TRY', isSystem: true, isActive: true },
  { code: '102.02', name: 'Ziraat Bankası Ticari TL Hesabı', type: 'asset', level: 4, parentCode: '102', currency: 'TRY', isSystem: true, isActive: true },
  { code: '102.03', name: 'İş Bankası Ticari TL Hesabı', type: 'asset', level: 4, parentCode: '102', currency: 'TRY', isSystem: false, isActive: true },
  { code: '102.04', name: 'Yapı Kredi Döviz USD Hesabı', type: 'asset', level: 4, parentCode: '102', currency: 'USD', isSystem: false, isActive: true },

  { code: '103', name: 'VERİLEN ÇEKLER VE ÖDEME EMİRLERİ (-)', type: 'asset', level: 3, parentCode: '10', isSystem: true, isActive: true },
  { code: '103.01', name: 'Verilen Firma Çekleri', type: 'asset', level: 4, parentCode: '103', currency: 'TRY', isSystem: true, isActive: true },

  { code: '108', name: 'DİĞER HAZIR DEĞERLER', type: 'asset', level: 3, parentCode: '10', isSystem: true, isActive: true },
  { code: '108.01', name: 'Kredi Kartı Slip / POS Alacakları', type: 'asset', level: 4, parentCode: '108', currency: 'TRY', isSystem: true, isActive: true },

  { code: '12', name: 'TİCARİ ALACAKLAR', type: 'asset', level: 2, parentCode: '1', isSystem: true, isActive: true },
  { code: '120', name: 'ALICILAR (MÜŞTERİLER)', type: 'asset', level: 3, parentCode: '12', isSystem: true, isActive: true },
  { code: '120.01', name: 'Yurtiçi Müşteriler Cari Hesabı', type: 'asset', level: 4, parentCode: '120', currency: 'TRY', isSystem: true, isActive: true },
  { code: '120.02', name: 'Yurtdışı Müşteriler Cari Hesabı', type: 'asset', level: 4, parentCode: '120', currency: 'USD', isSystem: false, isActive: true },
  
  { code: '121', name: 'ALACAK SENETLERİ', type: 'asset', level: 3, parentCode: '12', isSystem: true, isActive: true },
  { code: '121.01', name: 'Portföydeki Alacak Senetleri', type: 'asset', level: 4, parentCode: '121', currency: 'TRY', isSystem: true, isActive: true },

  { code: '128', name: 'ŞÜPHELİ TİCARİ ALACAKLAR', type: 'asset', level: 3, parentCode: '12', isSystem: true, isActive: true },

  { code: '15', name: 'STOKLAR', type: 'asset', level: 2, parentCode: '1', isSystem: true, isActive: true },
  { code: '150', name: 'İLK MADDE VE MALZEME', type: 'asset', level: 3, parentCode: '15', isSystem: true, isActive: true },
  { code: '150.01', name: 'Deri ve Suni Deri Stokları', type: 'asset', level: 4, parentCode: '150', currency: 'TRY', isSystem: true, isActive: true },
  { code: '150.02', name: 'Taban, Fuspet ve Ökçe Stokları', type: 'asset', level: 4, parentCode: '150', currency: 'TRY', isSystem: true, isActive: true },
  { code: '150.03', name: 'Astar ve Tekstil Malzemeleri', type: 'asset', level: 4, parentCode: '150', currency: 'TRY', isSystem: false, isActive: true },
  { code: '150.04', name: 'Yardımcı Malzeme ve Aksesuarlar', type: 'asset', level: 4, parentCode: '150', currency: 'TRY', isSystem: false, isActive: true },

  { code: '151', name: 'YARI MAMULLER - ÜRETİM', type: 'asset', level: 3, parentCode: '15', isSystem: true, isActive: true },
  { code: '151.01', name: 'Kesim ve Saya Yarı Mamulleri', type: 'asset', level: 4, parentCode: '151', currency: 'TRY', isSystem: true, isActive: true },
  { code: '151.02', name: 'Montaj Aşamasındaki Ürünler', type: 'asset', level: 4, parentCode: '151', currency: 'TRY', isSystem: false, isActive: true },

  { code: '152', name: 'MAMULLER', type: 'asset', level: 3, parentCode: '15', isSystem: true, isActive: true },
  { code: '152.01', name: 'Biten Ayakkabı Mamul Deposu', type: 'asset', level: 4, parentCode: '152', currency: 'TRY', isSystem: true, isActive: true },

  { code: '153', name: 'TİCARİ MALLAR', type: 'asset', level: 3, parentCode: '15', isSystem: true, isActive: true },
  { code: '153.01', name: 'Satın Alınan Ticari Mallar', type: 'asset', level: 4, parentCode: '153', currency: 'TRY', isSystem: true, isActive: true },

  { code: '159', name: 'VERİLEN SİPARİŞ AVANSLARI', type: 'asset', level: 3, parentCode: '15', isSystem: true, isActive: true },

  { code: '19', name: 'DİĞER DÖNEN VARLIKLAR', type: 'asset', level: 2, parentCode: '1', isSystem: true, isActive: true },
  { code: '190', name: 'DEVREDEN KDV', type: 'asset', level: 3, parentCode: '19', isSystem: true, isActive: true },
  { code: '191', name: 'İNDİRİLECEK KDV', type: 'asset', level: 3, parentCode: '19', isSystem: true, isActive: true },
  { code: '191.01', name: '%1 İndirilecek KDV', type: 'asset', level: 4, parentCode: '191', currency: 'TRY', isSystem: true, isActive: true },
  { code: '191.10', name: '%10 İndirilecek KDV', type: 'asset', level: 4, parentCode: '191', currency: 'TRY', isSystem: true, isActive: true },
  { code: '191.20', name: '%20 İndirilecek KDV', type: 'asset', level: 4, parentCode: '191', currency: 'TRY', isSystem: true, isActive: true },
  { code: '195', name: 'İŞ AVANSLARI (PERSONEL)', type: 'asset', level: 3, parentCode: '19', isSystem: false, isActive: true },

  // 2 DURAN VARLIKLAR
  { code: '2', name: 'DURAN VARLIKLAR', type: 'asset', level: 1, isSystem: true, isActive: true },
  { code: '25', name: 'MADDİ DURAN VARLIKLAR', type: 'asset', level: 2, parentCode: '2', isSystem: true, isActive: true },
  { code: '253', name: 'TESİS, MAKİNE VE CİHAZLAR', type: 'asset', level: 3, parentCode: '25', isSystem: true, isActive: true },
  { code: '253.01', name: 'Saya Kesim ve Dikiş Makineleri', type: 'asset', level: 4, parentCode: '253', currency: 'TRY', isSystem: false, isActive: true },
  { code: '253.02', name: 'Taban ve Kalıplama Presleri', type: 'asset', level: 4, parentCode: '253', currency: 'TRY', isSystem: false, isActive: true },
  { code: '255', name: 'DEMİRBAŞLAR', type: 'asset', level: 3, parentCode: '25', isSystem: true, isActive: true },
  { code: '255.01', name: 'Barkod Yazıcı ve Bilgisayar Donanımları', type: 'asset', level: 4, parentCode: '255', currency: 'TRY', isSystem: false, isActive: true },
  { code: '257', name: 'BİRİKMİŞ AMORTİSMANLAR (-)', type: 'asset', level: 3, parentCode: '25', isSystem: true, isActive: true },

  // 3 KISA VADELİ YABANCI KAYNAKLAR
  { code: '3', name: 'KISA VADELİ YABANCI KAYNAKLAR', type: 'liability', level: 1, isSystem: true, isActive: true },
  { code: '30', name: 'MALİ BORÇLAR', type: 'liability', level: 2, parentCode: '3', isSystem: true, isActive: true },
  { code: '300', name: 'BANKA KREDİLERİ', type: 'liability', level: 3, parentCode: '30', isSystem: true, isActive: true },
  { code: '300.01', name: 'Kısa Vadeli Banka Kredileri', type: 'liability', level: 4, parentCode: '300', currency: 'TRY', isSystem: false, isActive: true },
  
  { code: '32', name: 'TİCARİ BORÇLAR', type: 'liability', level: 2, parentCode: '3', isSystem: true, isActive: true },
  { code: '320', name: 'SATICILAR (TEDARİKÇİLER)', type: 'liability', level: 3, parentCode: '32', isSystem: true, isActive: true },
  { code: '320.01', name: 'Yurtiçi Mal ve Hizmet Tedarikçileri', type: 'liability', level: 4, parentCode: '320', currency: 'TRY', isSystem: true, isActive: true },
  { code: '320.02', name: 'Fason Saya ve Taban Atölyeleri', type: 'liability', level: 4, parentCode: '320', currency: 'TRY', isSystem: false, isActive: true },

  { code: '321', name: 'BORÇ SENETLERİ', type: 'liability', level: 3, parentCode: '32', isSystem: true, isActive: true },
  { code: '321.01', name: 'Verilen Tedarikçi Senetleri', type: 'liability', level: 4, parentCode: '321', currency: 'TRY', isSystem: false, isActive: true },

  { code: '340', name: 'ALINAN SİPARİŞ AVANSLARI', type: 'liability', level: 3, parentCode: '32', isSystem: true, isActive: true },

  { code: '36', name: 'ÖDENECEK VERGİ VE DİĞER YÜKÜMLÜLÜKLER', type: 'liability', level: 2, parentCode: '3', isSystem: true, isActive: true },
  { code: '360', name: 'ÖDENECEK VERGİ VE FONLAR', type: 'liability', level: 3, parentCode: '36', isSystem: true, isActive: true },
  { code: '360.01', name: 'Ödenecek Muhtasar Stopaj', type: 'liability', level: 4, parentCode: '360', currency: 'TRY', isSystem: true, isActive: true },
  { code: '360.02', name: 'Ödenecek KDV Tevkifatı', type: 'liability', level: 4, parentCode: '360', currency: 'TRY', isSystem: true, isActive: true },
  { code: '361', name: 'ÖDENECEK SOSYAL GÜVENLİK KESİNTİLERİ', type: 'liability', level: 3, parentCode: '36', isSystem: true, isActive: true },
  { code: '361.01', name: 'SGK İşçi ve İşveren Primleri', type: 'liability', level: 4, parentCode: '361', currency: 'TRY', isSystem: false, isActive: true },

  { code: '39', name: 'DİĞER KISA VADELİ YABANCI KAYNAKLAR', type: 'liability', level: 2, parentCode: '3', isSystem: true, isActive: true },
  { code: '391', name: 'HESAPLANAN KDV', type: 'liability', level: 3, parentCode: '39', isSystem: true, isActive: true },
  { code: '391.01', name: '%1 Hesaplanan KDV', type: 'liability', level: 4, parentCode: '391', currency: 'TRY', isSystem: true, isActive: true },
  { code: '391.10', name: '%10 Hesaplanan KDV', type: 'liability', level: 4, parentCode: '391', currency: 'TRY', isSystem: true, isActive: true },
  { code: '391.20', name: '%20 Hesaplanan KDV', type: 'liability', level: 4, parentCode: '391', currency: 'TRY', isSystem: true, isActive: true },

  // 4 UZUN VADELİ YABANCI KAYNAKLAR
  { code: '4', name: 'UZUN VADELİ YABANCI KAYNAKLAR', type: 'liability', level: 1, isSystem: true, isActive: true },
  { code: '400', name: 'UZUN VADELİ BANKA KREDİLERİ', type: 'liability', level: 3, parentCode: '4', isSystem: true, isActive: true },

  // 5 ÖZKAYNAKLAR
  { code: '5', name: 'ÖZKAYNAKLAR', type: 'equity', level: 1, isSystem: true, isActive: true },
  { code: '500', name: 'SERMAYE', type: 'equity', level: 3, parentCode: '5', isSystem: true, isActive: true },
  { code: '570', name: 'GEÇMİŞ YILLAR KÂRLARI', type: 'equity', level: 3, parentCode: '5', isSystem: true, isActive: true },
  { code: '580', name: 'GEÇMİŞ YILLAR ZARARLARI (-)', type: 'equity', level: 3, parentCode: '5', isSystem: true, isActive: true },
  { code: '590', name: 'DÖNEM NET KÂRI', type: 'equity', level: 3, parentCode: '5', isSystem: true, isActive: true },
  { code: '591', name: 'DÖNEM NET ZARARI (-)', type: 'equity', level: 3, parentCode: '5', isSystem: true, isActive: true },

  // 6 GELİR TABLOSU HESAPLARI
  { code: '6', name: 'GELİR TABLOSU HESAPLARI', type: 'revenue', level: 1, isSystem: true, isActive: true },
  { code: '60', name: 'BRÜT SATIŞLAR', type: 'revenue', level: 2, parentCode: '6', isSystem: true, isActive: true },
  { code: '600', name: 'YURTİÇİ SATIŞLAR', type: 'revenue', level: 3, parentCode: '60', isSystem: true, isActive: true },
  { code: '600.01', name: '%1 KDV Yurtiçi Satışlar', type: 'revenue', level: 4, parentCode: '600', currency: 'TRY', isSystem: true, isActive: true },
  { code: '600.10', name: '%10 KDV Yurtiçi Satışlar', type: 'revenue', level: 4, parentCode: '600', currency: 'TRY', isSystem: true, isActive: true },
  { code: '600.20', name: '%20 KDV Yurtiçi Satışlar', type: 'revenue', level: 4, parentCode: '600', currency: 'TRY', isSystem: true, isActive: true },
  
  { code: '601', name: 'YURTDIŞI SATIŞLAR (İHRACAT)', type: 'revenue', level: 3, parentCode: '60', isSystem: true, isActive: true },

  { code: '61', name: 'SATIŞ İNDİRİMLERİ (-)', type: 'revenue', level: 2, parentCode: '6', isSystem: true, isActive: true },
  { code: '610', name: 'SATIŞTAN İADELER (-)', type: 'revenue', level: 3, parentCode: '61', isSystem: true, isActive: true },
  { code: '611', name: 'SATIŞ İSKONTOLARI (-)', type: 'revenue', level: 3, parentCode: '61', isSystem: true, isActive: true },

  { code: '62', name: 'SATIŞLARIN MALİYETİ (-)', type: 'cost', level: 2, parentCode: '6', isSystem: true, isActive: true },
  { code: '620', name: 'SATILAN MAMULLER MALİYETİ (-)', type: 'cost', level: 3, parentCode: '62', isSystem: true, isActive: true },
  { code: '621', name: 'SATILAN TİCARİ MALLAR MALİYETİ (-)', type: 'cost', level: 3, parentCode: '62', isSystem: true, isActive: true },

  { code: '64', name: 'DİĞER FAALİYETLERDEN OLAĞAN GELİR VE KÂRLAR', type: 'revenue', level: 2, parentCode: '6', isSystem: true, isActive: true },
  { code: '642', name: 'FAİZ GELİRLERİ', type: 'revenue', level: 3, parentCode: '64', isSystem: true, isActive: true },
  { code: '646', name: 'KAMBİYO KÂRLARI', type: 'revenue', level: 3, parentCode: '64', isSystem: true, isActive: true },

  { code: '65', name: 'DİĞER FAALİYETLERDEN OLAĞAN GİDER VE ZARARLAR (-)', type: 'expense', level: 2, parentCode: '6', isSystem: true, isActive: true },
  { code: '656', name: 'KAMBİYO ZARARLARI (-)', type: 'expense', level: 3, parentCode: '65', isSystem: true, isActive: true },

  { code: '66', name: 'FİNANSMAN GİDERLERİ (-)', type: 'expense', level: 2, parentCode: '6', isSystem: true, isActive: true },
  { code: '660', name: 'KISA VADELİ BORÇLANMA GİDERLERİ (-)', type: 'expense', level: 3, parentCode: '66', isSystem: true, isActive: true },

  // 7 MALİYET HESAPLARI (7/A)
  { code: '7', name: 'MALİYET HESAPLARI', type: 'cost', level: 1, isSystem: true, isActive: true },
  { code: '710', name: 'DİREKT İLK MADDE VE MALZEME GİDERLERİ', type: 'cost', level: 3, parentCode: '7', isSystem: true, isActive: true },
  { code: '720', name: 'DİREKT İŞÇİLİK GİDERLERİ', type: 'cost', level: 3, parentCode: '7', isSystem: true, isActive: true },
  { code: '730', name: 'GENEL ÜRETİM GİDERLERİ', type: 'cost', level: 3, parentCode: '7', isSystem: true, isActive: true },
  
  { code: '760', name: 'PAZARLAMA, SATIŞ VE DAĞITIM GİDERLERİ', type: 'expense', level: 3, parentCode: '7', isSystem: true, isActive: true },
  { code: '760.01', name: 'Kargo ve Lojistik Giderleri', type: 'expense', level: 4, parentCode: '760', currency: 'TRY', isSystem: false, isActive: true },
  { code: '760.02', name: 'Reklam, Pazarlama ve Fuar Giderleri', type: 'expense', level: 4, parentCode: '760', currency: 'TRY', isSystem: false, isActive: true },

  { code: '770', name: 'GENEL YÖNETİM GİDERLERİ', type: 'expense', level: 3, parentCode: '7', isSystem: true, isActive: true },
  { code: '770.01', name: 'Yönetim Personel Maaş ve Ücretleri', type: 'expense', level: 4, parentCode: '770', currency: 'TRY', isSystem: true, isActive: true },
  { code: '770.02', name: 'Kira ve Aidat Giderleri', type: 'expense', level: 4, parentCode: '770', currency: 'TRY', isSystem: false, isActive: true },
  { code: '770.03', name: 'Elektrik, Su, Doğalgaz Giderleri', type: 'expense', level: 4, parentCode: '770', currency: 'TRY', isSystem: false, isActive: true },
  { code: '770.04', name: 'Haberleşme, İnternet ve Telefon', type: 'expense', level: 4, parentCode: '770', currency: 'TRY', isSystem: false, isActive: true },
  { code: '770.05', name: 'Muhasebe, Mali Müşavirlik ve Hukuk', type: 'expense', level: 4, parentCode: '770', currency: 'TRY', isSystem: false, isActive: true },
  { code: '770.06', name: 'Yemek, İkram ve Mutfak Harcamaları', type: 'expense', level: 4, parentCode: '770', currency: 'TRY', isSystem: false, isActive: true },
  { code: '770.07', name: 'Ofis Kırtasiye ve Sarf Malzemeleri', type: 'expense', level: 4, parentCode: '770', currency: 'TRY', isSystem: false, isActive: true },

  { code: '780', name: 'FİNANSMAN GİDERLERİ', type: 'expense', level: 3, parentCode: '7', isSystem: true, isActive: true }
];

export const INITIAL_CASH_BOXES: Omit<CashBox, 'id'>[] = [
  {
    code: 'KAS-01',
    name: 'Merkez TL Kasası',
    accountCode: '100.01',
    currency: 'TRY',
    balance: 45000,
    responsiblePerson: 'Muhasebe Müdürü',
    notes: 'Ana fabrika ve genel yönetim nakit kasası',
    createdAt: new Date()
  },
  {
    code: 'KAS-02',
    name: 'Şube / Mağaza Kasası',
    accountCode: '100.02',
    currency: 'TRY',
    balance: 12500,
    responsiblePerson: 'Mağaza Satış Sorumlusu',
    notes: 'Perakende satış noktası kasası',
    createdAt: new Date()
  },
  {
    code: 'KAS-03',
    name: 'Döviz Kasası (USD)',
    accountCode: '100.03',
    currency: 'USD',
    balance: 3200,
    responsiblePerson: 'Finans Yetkilisi',
    notes: 'İhracat ve dövizli tahsilat kasası',
    createdAt: new Date()
  }
];

export const INITIAL_BANK_ACCOUNTS: Omit<BankAccount, 'id'>[] = [
  {
    bankName: 'Garanti BBVA',
    branchName: 'İkitelli OSB Şubesi',
    accountNumber: '4521-6284910',
    iban: 'TR62 0006 2000 0001 2345 6789 01',
    accountCode: '102.01',
    currency: 'TRY',
    balance: 185400,
    notes: 'Ana ticari operasyon hesabı',
    createdAt: new Date()
  },
  {
    bankName: 'Ziraat Bankası',
    branchName: 'Güngören Şubesi',
    accountNumber: '1084-7749102',
    iban: 'TR33 0001 0004 0000 9876 5432 10',
    accountCode: '102.02',
    currency: 'TRY',
    balance: 92800,
    notes: 'Vergi ve SGK ödeme hesabı',
    createdAt: new Date()
  },
  {
    bankName: 'İş Bankası',
    branchName: 'Merter Ticari Şube',
    accountNumber: '3410-8812903',
    iban: 'TR88 0006 4000 0012 3456 7890 12',
    accountCode: '102.03',
    currency: 'TRY',
    balance: 54000,
    notes: 'Tedarikçi EFT / Havale hesabı',
    createdAt: new Date()
  }
];
