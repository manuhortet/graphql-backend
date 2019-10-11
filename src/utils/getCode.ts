import { randomBytes } from 'crypto';


export const getCode = (digits: number) => {
  let result = "";
  let counter = 0;
  while (counter < 6) {
    const buffer = randomBytes(8);
    const hex = buffer.toString("hex");
    const integer = parseInt(hex, 16);
    const random = (integer / 0xffffffffffffffff).toString().split("");
    const digit = random[random.length - 1];
    result += digit;
    counter += 1;
  }
  return result;
};