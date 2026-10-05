/**
 * Kontrollü iş kuralı hataları (4xx).
 *
 * API hata yöneticisi `status` ve `code` alanlarına bakar: 4xx yanıtları
 * mesaj + kod olarak istemciye güvenle döner, 5xx yanıtları ise genel bir
 * mesaja indirgenir (SQL/yığın izi sızmaz). Bu yüzden doğrulama, yetki ve
 * iş kuralı retlerinde MUTLAKA bu sınıf (veya türevi) fırlatılmalıdır;
 * düz `Error` fırlatmak 500 + genel mesaj üretir.
 */
export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
