(define-constant ERR-INVALID-TOTAL u1000)
(define-constant ERR-INVALID-PARTICIPANT u1001)
(define-constant ERR-INVALID-ROLE u1002)
(define-constant ERR-TOUR-NOT-FOUND u1003)
(define-constant ERR-TOUR-CLOSED u1004)
(define-constant ERR-INVALID-AMOUNT u1005)
(define-constant ERR-ALREADY-REGISTERED u1006)
(define-constant ERR-AUTHORITY-NOT-SET u1007)
(define-constant ERR-NOT-AUTHORIZED u1008)
(define-constant ERR-INVALID-WEIGHT u1009)

(define-data-var authority-contract (optional principal) none)
(define-data-var default-split-rule uint u1)

(define-map tour-splits
  { tour-id: uint }
  {
    total-cost: uint,
    max-participants: uint,
    role-weights: (list 50 { role: (string-ascii 20), weight: uint }),
    current-participants: uint,
    status: bool
  }
)

(define-map participant-shares
  { tour-id: uint, participant: principal }
  { share: uint, role: (string-ascii 20), paid: bool }
)

(define-read-only (get-tour-split (tour-id uint))
  (map-get? tour-splits { tour-id: tour-id })
)

(define-read-only (get-participant-share (tour-id uint) (participant principal))
  (map-get? participant-shares { tour-id: tour-id, participant: participant })
)

(define-read-only (calculate-share (tour-id uint) (role (string-ascii 20)))
  (let
    (
      (tour-split (unwrap! (map-get? tour-splits { tour-id: tour-id }) (err ERR-TOUR-NOT-FOUND)))
      (total-cost (get total-cost tour-split))
      (max-part (get max-participants tour-split))
      (weights (get role-weights tour-split))
      (role-weight (default-to u100 (fold find-weight weights (some role))))
      (adjusted-total (+ (* (get current-participants tour-split) u100) (- u100 (default-to u100 (fold find-weight weights (some "organizer"))))))
    )
    (if (and (> total-cost u0) (get status tour-split))
      (ok (/ (* total-cost role-weight) adjusted-total))
      (err ERR-TOUR-CLOSED)
    )
  )
)

(define-private (find-weight (entry { role: (string-ascii 20), weight: uint }) (acc (optional uint)))
  (if (is-eq (get role entry) (unwrap! acc (err ERR-INVALID-ROLE)))
    (some (get weight entry))
    acc
  )
)

(define-public (set-authority-contract (contract principal))
  (begin
    (asserts! (not (is-eq contract 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set authority-contract (some contract))
    (ok true)
  )
)

(define-public (update-split (tour-id uint) (total-cost uint) (max-participants uint) (role-weights (list 50 { role: (string-ascii 20), weight: uint })))
  (let
    (
      (tour-split (unwrap! (map-get? tour-splits { tour-id: tour-id }) (err ERR-TOUR-NOT-FOUND)))
      (authority (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET)))
    )
    (asserts! (is-eq tx-sender authority) (err ERR-NOT-AUTHORIZED))
    (asserts! (> max-participants u0) (err ERR-INVALID-PARTICIPANT))
    (asserts! (> total-cost u0) (err ERR-INVALID-AMOUNT))
    (asserts! (is-some (fold validate-weights role-weights (some u0))) (err ERR-INVALID-WEIGHT))
    (map-set tour-splits
      { tour-id: tour-id }
      {
        total-cost: total-cost,
        max-participants: max-participants,
        role-weights: role-weights,
        current-participants: (get current-participants tour-split),
        status: (get status tour-split)
      }
    )
    (ok true)
  )
)

(define-private (validate-weights (entry { role: (string-ascii 20), weight: uint }) (acc (optional uint)))
  (if (and (> (get weight entry) u0) (<= (get weight entry) u1000))
    (some (+ (unwrap! acc (err ERR-INVALID-WEIGHT)) (get weight entry)))
    none
  )
)

(define-public (add-participant (tour-id uint) (role (string-ascii 20)))
  (let
    (
      (tour-split (unwrap! (map-get? tour-splits { tour-id: tour-id }) (err ERR-TOUR-NOT-FOUND)))
      (current-count (get current-participants tour-split))
      (share (unwrap! (calculate-share tour-id role) (err ERR-TOUR-CLOSED)))
    )
    (asserts! (get status tour-split) (err ERR-TOUR-CLOSED))
    (asserts! (< current-count (get max-participants tour-split)) (err ERR-INVALID-PARTICIPANT))
    (asserts! (is-none (map-get? participant-shares { tour-id: tour-id, participant: tx-sender })) (err ERR-ALREADY-REGISTERED))
    (map-set participant-shares
      { tour-id: tour-id, participant: tx-sender }
      { share: share, role: role, paid: false }
    )
    (map-set tour-splits
      { tour-id: tour-id }
      (merge tour-split { current-participants: (+ current-count u1) })
    )
    (ok share)
  )
)

(define-public (close-tour (tour-id uint))
  (let
    (
      (tour-split (unwrap! (map-get? tour-splits { tour-id: tour-id }) (err ERR-TOUR-NOT-FOUND)))
      (authority (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET)))
    )
    (asserts! (is-eq tx-sender authority) (err ERR-NOT-AUTHORIZED))
    (map-set tour-splits
      { tour-id: tour-id }
      (merge tour-split { status: false })
    )
    (ok true)
  )
)

(define-read-only (validate-split (tour-id uint))
  (let
    (
      (tour-split (unwrap! (map-get? tour-splits { tour-id: tour-id }) (err ERR-TOUR-NOT-FOUND)))
      (total-cost (get total-cost tour-split))
      (part-count (get current-participants tour-split))
      (sample-share (unwrap! (calculate-share tour-id "participant") (err ERR-TOUR-CLOSED)))
    )
    (ok (is-eq (* sample-share part-count) total-cost))
  )
)