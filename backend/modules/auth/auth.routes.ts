import { Router } from 'express';
import {
  logout, switchOrg, signup, confirmSignup, resendSignupCode,
  login, refresh, forgotPassword, confirmForgotPassword, changePassword,
} from './auth.controller';
import { authMiddleware } from '../../middleware/authMiddleware';

const router = Router();

// AWS mode: signup, login, forgot-password, confirm-* all happen client-side
// directly against Cognito — backend only exposes ops that need server-side
// credentials. Manual mode (AUTH_PROVIDER=manual): the endpoints below serve
// the whole auth flow from the backend (each 400s cleanly under AWS mode).

router.post('/signup',               signup);
router.post('/confirm-signup',       confirmSignup);
router.post('/resend-signup-code',   resendSignupCode);
router.post('/login',                login);
router.post('/refresh',              refresh);
router.post('/forgot-password',      forgotPassword);
router.post('/confirm-forgot-password', confirmForgotPassword);
router.post('/change-password',      authMiddleware, changePassword);
router.post('/logout',               authMiddleware, logout);
router.post('/switch-org',           authMiddleware, switchOrg);

export default router;
