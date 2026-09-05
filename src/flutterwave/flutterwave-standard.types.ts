export type FlutterwaveStandardPaymentResponse = {
  status: string;
  message?: string;
  data?: {
    link?: string;
  };
};

export type FlutterwaveVerifyTransactionResponse = {
  status: string;
  message?: string;
  data?: {
    id?: number;
    tx_ref?: string;
    flw_ref?: string;
    status?: string;
    amount?: number;
    currency?: string;
    charged_amount?: number;
    customer?: {
      email?: string;
      name?: string;
    };
  };
};

export type FlutterwaveV3WebhookPayload = {
  event?: string;
  data?: {
    id?: number;
    tx_ref?: string;
    flw_ref?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
};
