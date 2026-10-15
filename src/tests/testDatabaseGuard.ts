export function assertTestDatabase(): void {
  if (process.env.PROERP_TEST_DB !== '1' || !/^proerp_test_[a-z0-9_]+$/i.test(process.env.DB_NAME || '')) {
    throw new Error('Entegrasyon testleri yalnızca PROERP_TEST_DB=1 ve DB_NAME=proerp_test_… ile izole test veritabanında çalıştırılabilir.');
  }
}
