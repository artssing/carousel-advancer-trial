import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';
import { OrdersService } from './orders.service';
import { AddEvidenceDto, CreateOrderDto, DisputeDto, PhotosDto, RePhotoRequestDto, ReviewDto, SoftReasonDto, VerdictDto } from './dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateOrderDto) {
    return this.orders.createFromListing(user.userId, dto);
  }

  // Must be before :id route to avoid being swallowed
  @Get('authenticator-inbox')
  authenticatorInbox(@CurrentUser() user: CurrentUserData) {
    return this.orders.listForAuthenticator(user.userId);
  }

  /** Fast search across own orders. ?q= matches title / id-prefix / brand / party names. */
  @Get('authenticator-search')
  authenticatorSearch(
    @CurrentUser() user: CurrentUserData,
    @Query('q') q?: string,
  ) {
    return this.orders.searchForAuthenticator(user.userId, q ?? '');
  }

  /** Count of orders where the current user has an action pending. */
  @Get('badge-count')
  badgeCount(@CurrentUser() user: CurrentUserData) {
    return this.orders.actionRequiredCount(user.userId);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.orders.listForUser(user.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.get(id, user.userId);
  }

  @Patch(':id/pay')
  pay(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.markPaid(id, user.userId);
  }

  @Patch(':id/ship-to-authenticator')
  shipToAuthenticator(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.shipToAuthenticator(id, user.userId);
  }

  @Patch(':id/ship-to-buyer-direct')
  shipToBuyerDirect(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.shipToBuyerDirect(id, user.userId);
  }

  @Patch(':id/mark-received')
  markReceived(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: PhotosDto,
  ) {
    return this.orders.markAuthenticatorReceived(id, user.userId, dto.photos);
  }

  @Patch(':id/verdict')
  verdict(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: VerdictDto,
  ) {
    return this.orders.submitVerdict(id, user.userId, dto);
  }

  /** Commit metadata for a file already uploaded via POST /api/uploads. */
  @Post(':id/evidence')
  addEvidence(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: AddEvidenceDto,
  ) {
    return this.orders.addEvidence(id, user.userId, dto);
  }

  @Get(':id/evidence')
  listEvidence(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.getEvidence(id, user.userId);
  }

  @Patch(':id/ship-to-buyer')
  shipToBuyer(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.shipToBuyer(id, user.userId);
  }

  @Patch(':id/confirm-delivered')
  confirmDelivered(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: PhotosDto,
  ) {
    return this.orders.confirmDelivered(id, user.userId, dto.photos);
  }

  @Patch(':id/auth-delivery-ack')
  authDeliveryAck(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.authDeliveryAck(id, user.userId);
  }

  // ── Meetup-specific transitions ──────────────────────────────────────────

  @Patch(':id/start-meetup-auth')
  startMeetupAuth(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.startMeetupAuth(id, user.userId);
  }

  @Patch(':id/complete-meetup')
  completeMeetup(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.completeMeetup(id, user.userId);
  }

  // ── MEETUP_AUTH Dual-Ack Flow ────────────────────────────────────────────

  @Patch(':id/start-meetup-handover')
  startMeetupHandover(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.startMeetupHandover(id, user.userId);
  }

  @Patch(':id/auth-receive-ack')
  authReceiveAck(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: PhotosDto,
  ) {
    return this.orders.authReceiveAck(id, user.userId, dto.photos);
  }

  @Patch(':id/seller-handover-ack')
  sellerHandoverAck(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.sellerHandoverAck(id, user.userId);
  }

  @Patch(':id/submit-verdict-meetup')
  submitVerdictMeetup(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: VerdictDto,
  ) {
    return this.orders.submitVerdictMeetup(id, user.userId, dto);
  }

  @Patch(':id/buyer-receive-ack')
  buyerReceiveAck(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.buyerReceiveAck(id, user.userId);
  }

  @Patch(':id/upload-return-photos')
  uploadReturnPhotos(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: PhotosDto,
  ) {
    return this.orders.uploadReturnPhotos(id, user.userId, dto.photos);
  }

  @Patch(':id/seller-return-ack')
  sellerReturnAck(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.sellerReturnAck(id, user.userId);
  }

  @Patch(':id/dispute')
  dispute(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: DisputeDto,
  ) {
    return this.orders.disputeMeetup(id, user.userId, dto.reason);
  }

  /** Seller-only soft option: ask authenticator to re-photograph (Phase A) */
  @Patch(':id/request-rephoto')
  requestRePhoto(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: RePhotoRequestDto,
  ) {
    return this.orders.requestRePhoto(id, user.userId, {
      presets: dto.presets,
      comment: dto.comment,
    });
  }

  /** Seller-only soft option: cancel handover before custody (Phase A) */
  @Patch(':id/cancel-handover')
  cancelHandover(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: SoftReasonDto,
  ) {
    return this.orders.cancelHandover(id, user.userId, dto.reason);
  }

  // ── SHIP completion ──────────────────────────────────────────────────────

  @Patch(':id/complete')
  complete(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.orders.completeOrder(id, user.userId);
  }

  @Post(':id/review')
  review(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.orders.submitReview(id, user.userId, dto);
  }
}
