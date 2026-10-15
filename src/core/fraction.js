// Exact rational arithmetic for just-intonation ratios.

export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a, b) {
  return a && b ? Math.abs(a * b) / gcd(a, b) : 0;
}

/** Reduce a list of integers by their common gcd (4:6 -> 2:3). */
export function reduce(...ints) {
  const list = ints.flat();
  const g = list.reduce((acc, n) => gcd(acc, n), 0);
  if (!g) throw new RangeError('reduce() needs at least one non-zero integer');
  return list.map(n => n / g);
}

export class Fraction {
  constructor(num, den = 1) {
    if (!Number.isInteger(num) || !Number.isInteger(den)) throw new TypeError('Fraction parts must be integers');
    if (den === 0) throw new RangeError('Fraction denominator must not be 0');
    const sign = den < 0 ? -1 : 1;
    const g = gcd(num, den) || 1;
    this.num = (sign * num) / g;
    this.den = Math.abs(den) / g;
  }

  static from(x) {
    if (x instanceof Fraction) return x;
    if (Array.isArray(x)) return new Fraction(x[0], x[1]);
    return new Fraction(x, 1);
  }

  mul(other) {
    const o = Fraction.from(other);
    return new Fraction(this.num * o.num, this.den * o.den);
  }

  div(other) {
    const o = Fraction.from(other);
    return new Fraction(this.num * o.den, this.den * o.num);
  }

  get value() {
    return this.num / this.den;
  }

  equals(other) {
    const o = Fraction.from(other);
    return this.num === o.num && this.den === o.den;
  }

  toString() {
    return `${this.num}/${this.den}`;
  }
}

/** Integers proportional to the fractions: scale by the LCM of the denominators, reduce by the GCD. */
export function fractionsToInts(fractions) {
  const L = fractions.reduce((acc, f) => lcm(acc, f.den), 1);
  return reduce(fractions.map(f => (f.num * L) / f.den));
}
