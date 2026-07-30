import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import * as controller from './users.controller';
import { updateProfileSchema } from './users.schemas';

const router = Router();

router.use(authenticate);

router.get('/me', controller.getMe);
router.patch('/me', validate(updateProfileSchema), controller.updateMe);
router.delete('/me', controller.deleteMe);

export default router;
