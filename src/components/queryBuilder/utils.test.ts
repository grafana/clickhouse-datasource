import { isDateTimeType, isDateType, isNumberType } from './utils';

describe('isDateType', () => {
  it('returns true for Date type', () => {
    expect(isDateType('Date')).toBe(true);
    expect(isDateType('date')).toBe(true);
  });
  it('returns true for Nullable(Date) type', () => {
    expect(isDateType('Nullable(Date)')).toBe(true);
  });

  it('returns true for Date32 type', () => {
    expect(isDateType('Date32')).toBe(true);
    expect(isDateType('date32')).toBe(true);
  });
  it('returns true for Nullable(Date) type', () => {
    expect(isDateType('Nullable(Date32)')).toBe(true);
  });

  it('returns true for Datetime type', () => {
    expect(isDateType('Datetime')).toBe(true);
    expect(isDateType('datetime')).toBe(true);
    expect(isDateType("DateTime('Asia/Istanbul')")).toBe(true);
  });
  it('returns true for Nullable(Date) type', () => {
    expect(isDateType("Nullable(DateTime('Asia/Istanbul'))")).toBe(true);
  });

  it('returns true for Datetime64 type', () => {
    expect(isDateType('Datetime64(3)')).toBe(true);
    expect(isDateType('datetime64(3)')).toBe(true);
    expect(isDateType("Datetime64(3, 'Asia/Istanbul')")).toBe(true);
  });
  it('returns true for Nullable(Date) type', () => {
    expect(isDateType("Nullable(Datetime64(3, 'Asia/Istanbul'))")).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isDateType('boolean')).toBe(false);
    expect(isDateType('Boolean')).toBe(false);
  });
});

describe('isDateTimeType', () => {
  it('returns true for DateTime type', () => {
    expect(isDateTimeType('DateTime')).toBe(true);
    expect(isDateTimeType('datetime')).toBe(true);
  });
  it('returns true for Nullable(DateTime) type', () => {
    expect(isDateTimeType('Nullable(DateTime)')).toBe(true);
  });
  it('returns true for DateTime64 type', () => {
    expect(isDateTimeType('DateTime64(3)')).toBe(true);
    expect(isDateTimeType('datetime64(3)')).toBe(true);
    expect(isDateTimeType("Datetime64(3, 'Asia/Istanbul')")).toBe(true);
  });
  it('returns true for Nullable(DateTime64(3)) type', () => {
    expect(isDateTimeType('Nullable(DateTime64(3))')).toBe(true);
    expect(isDateTimeType("Nullable(DateTime64(3, 'Asia/Istanbul'))")).toBe(true);
  });
  it('returns false for Date type', () => {
    expect(isDateTimeType('Date')).toBe(false);
    expect(isDateTimeType('date')).toBe(false);
    expect(isDateTimeType('Date32')).toBe(false);
    expect(isDateTimeType('date32')).toBe(false);
  });
  it('returns false for Nullable(Date) type', () => {
    expect(isDateTimeType('Nullable(Date)')).toBe(false);
    expect(isDateTimeType('Nullable(Date32)')).toBe(false);
    expect(isDateTimeType('nullable(date)')).toBe(false);
    expect(isDateTimeType('nullable(date32)')).toBe(false);
  });
  it('returns false for other types', () => {
    expect(isDateTimeType('boolean')).toBe(false);
    expect(isDateTimeType('String')).toBe(false);
  });
});

describe('isNumberType', () => {
  it('returns true for UInt* types', () => {
    expect(isNumberType('UInt8')).toBe(true);
    expect(isNumberType('UInt16')).toBe(true);
    expect(isNumberType('UInt32')).toBe(true);
    expect(isNumberType('UInt64')).toBe(true);
    expect(isNumberType('UInt128')).toBe(true);
    expect(isNumberType('UInt256')).toBe(true);
  });

  it('returns true for Int* types', () => {
    expect(isNumberType('Int8')).toBe(true);
    expect(isNumberType('Int16')).toBe(true);
    expect(isNumberType('Int32')).toBe(true);
    expect(isNumberType('Int64')).toBe(true);
    expect(isNumberType('Int128')).toBe(true);
    expect(isNumberType('Int256')).toBe(true);
  });

  it('returns true for Float types', () => {
    expect(isNumberType('Float32')).toBe(true);
    expect(isNumberType('Float64')).toBe(true);
  });

  it('returns true for Decimal types', () => {
    expect(isNumberType('Decimal(1,2)')).toBe(true);
    expect(isNumberType('Decimal32(3)')).toBe(true);
    expect(isNumberType('Decimal64(3)')).toBe(true);
    expect(isNumberType('Decimal128(3)')).toBe(true);
    expect(isNumberType('Decimal256(3)')).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isNumberType('boolean')).toBe(false);
    expect(isNumberType('datetime')).toBe(false);
    expect(isNumberType('Nullable')).toBe(false);
  });
});
