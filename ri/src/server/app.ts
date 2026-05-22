import express from "express";
import session from "express-session";
import type { RequestHandler } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { db, pool } from "./db/index.js";
import { users } from "./db/schema.js";
import { eq } from "drizzle-orm";
import type { User } from "./db/schema.js";

import authRouter from "./routes/auth.js";
import chatRouter from "./routes/chat.js";
import scootRouter from "./routes/scoot.js";
import scootsRouter from "./routes/scoots.js";
import botRouter from "./routes/bot.js";
import mediaRouter from "./routes/media.js";

const PgSession = connectPgSimple(session);

export const sessionMiddleware: RequestHandler = session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy(async (username, password, done) => {
    const user = await db.query.users.findFirst({ where: eq(users.username, username) });
    if (!user) return done(null, false);
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return done(null, false);
    return done(null, user);
  })
);

passport.serializeUser((user, done) => done(null, (user as User).id));
passport.deserializeUser(async (id: number, done) => {
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  done(null, user ?? false);
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/scoot", scootRouter);
app.use("/api/v1/scoots", scootsRouter);
app.use("/api/v1/bot", botRouter);
app.use("/api/v1/media", mediaRouter);

export { app };
