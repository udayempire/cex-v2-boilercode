import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { prisma } from "../db.js";
import { authSchema } from "../types/auth-schema.js";
import { createToken } from "../utils/auth.js";
import { sendValidationError } from "../utils/validation.js";

export async function signup(req: Request, res: Response): Promise<void> {
  const parsedBody = authSchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }

  const { username, password } = parsedBody.data;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });
    res.status(201).json({
      token: createToken({ userId: user.id }),
      userId: user.id,
      username: user.username,
    });
  } catch {
    res.status(409).json({ error: "username already exists" });
  }
}

export async function signin(req: Request, res: Response): Promise<void> {
  const parsedBody = authSchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }
  const { username, password } = parsedBody.data;
  try {
    const user = await prisma.user.findUnique({
      where: {
        username
      }
    })
    // below commented approach is wrong because a attacker might discover if username exists or not and in new way no one can tell whats wrong and it is what used at production. 
    
    // if(!user){
    //   res.status(404).json({error: "username doesnt exist"});
    //   return;
    // }
    // const validPassword = await bcrypt.compare(
    //   password,
    //   user.password
    // )
    // if(!validPassword){
    //   res.status(401).json({message:"User password is incorrect"});
    //   return
    // }
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({
        error: "Invalid username or password"
      });
      return;
    }
    res.status(200).json({
      token: createToken({ userId: user.id }),
      userId: user.id,
      username: user.username,
      message: "Successfully signed In"
    });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" })
  };
}
