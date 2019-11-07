import * as Joi from 'joi';


export function validatePersonFields(email: string, name: string, password: string) {
  const schema = Joi.object().keys({
    email: Joi.string()
      .email({ minDomainAtoms: 2 })
      .required(),
    name: Joi.string()
      .min(3)
      .max(50)
      .required(),
    password: Joi.string()
      .min(10)
      .required()
  });
  Joi.validate({ email, name, password }, schema, (err, value) => {
    if (err) {
      throw new Error(err.details.map(d => d.message).join("\n"));
    }
  });
}
