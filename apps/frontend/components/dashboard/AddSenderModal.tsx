'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { createSender } from '@/lib/api';
import toast from 'react-hot-toast';

interface AddSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddSenderModal({ isOpen, onClose, onSuccess }: AddSenderModalProps) {
  const [email, setEmail] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.ethereal.email');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email || !smtpHost || !smtpUser || !smtpPassword) {
      toast.error('All fields are required');
      return;
    }

    try {
      setSubmitting(true);
      await createSender({
        email,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPassword,
      });
      toast.success('Sender added successfully');
      setEmail('');
      setSmtpUser('');
      setSmtpPassword('');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add sender');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Sender" size="md">
      <div className="space-y-4">
        <Input
          label="Sender Email"
          type="email"
          value={email}
          onChange={(e) => {
            const newEmail = e.target.value;
            setEmail(newEmail);
            if (!smtpUser || smtpUser === email) {
              setSmtpUser(newEmail);
            }
          }}
          placeholder="werner.bergstrom74@ethereal.email"
        />
        <Input
          label="SMTP Host"
          value={smtpHost}
          onChange={(e) => setSmtpHost(e.target.value)}
          placeholder="smtp.ethereal.email"
        />
        <Input
          label="SMTP Port"
          type="number"
          value={smtpPort.toString()}
          onChange={(e) => setSmtpPort(Number(e.target.value))}
        />
        <div>
          <Input
            label="SMTP Username"
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            placeholder="werner.bergstrom74@ethereal.email"
          />
          <p className="text-[11px] text-text-muted mt-1">
            Note: For Ethereal and most SMTP services, this is your full email address, not your personal display name.
          </p>
        </div>
        <Input
          label="SMTP Password"
          type="password"
          value={smtpPassword}
          onChange={(e) => setSmtpPassword(e.target.value)}
          placeholder="Your SMTP password"
        />

        <div className="rounded-lg bg-highlight-bg border-l-4 border-l-highlight-border border-y border-r border-border-light p-3">
          <p className="text-xs text-text-primary">
            <strong>Tip:</strong> Create an Ethereal account at{' '}
            <a
              href="https://ethereal.email"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              ethereal.email
            </a>{' '}
            to get test SMTP credentials.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-border-light">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Add Sender
          </Button>
        </div>
      </div>
    </Modal>
  );
}
