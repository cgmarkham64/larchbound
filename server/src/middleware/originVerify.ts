import { Request, Response, NextFunction } from 'express'

const ORIGIN_VERIFY_HEADER = 'x-origin-verify'

// CloudFront attaches this header (a shared secret) to every request it forwards
// to the Lightsail origin. Lightsail's firewall can't reference CloudFront's managed
// prefix list (that's an EC2/VPC Security Group feature, not available on Lightsail),
// so this is the substitute: port 8000 stays open to the internet, but anything
// without the right header gets rejected before touching real routes.
// No-ops when ORIGIN_VERIFY_SECRET is unset, so local dev and Docker Compose dev
// (no CloudFront in front) are unaffected.
export function requireOriginSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.ORIGIN_VERIFY_SECRET
  if (!secret) {
    next()
    return
  }
  if (req.headers[ORIGIN_VERIFY_HEADER] !== secret) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}